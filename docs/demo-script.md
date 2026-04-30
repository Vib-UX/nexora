# Nexora — Walkthrough

Total runtime target: 5 minutes. Every step has an objective + a fallback.

## Pre-flight

```bash
pnpm install
./scripts/dev-up.sh             # boots local Nitro + RPC at :8547
DEPLOYER_PRIVATE_KEY=0x... pnpm tsx scripts/deploy-all.ts
NEXT_PUBLIC_DEPLOYMENTS=$(cat deployments.json) pnpm --filter @nexora/dashboard dev
```

You will need:

- MetaMask (or any injected EVM wallet)
- A funded EOA on the Nexora devnet (use the dev faucet or a pre-funded
  genesis account in `chain/data/`)

## 1. Connect — "this is a normal EVM chain"

Open `http://localhost:3000`. Click **+ add Nexora Devnet to wallet**.
This calls `wallet_addEthereumChain` with chainId `0x4E58`. MetaMask
shows a generic chain prompt. Approve.

**Why this matters**: the post-quantum machinery is invisible to the
wallet. Standard tooling, standard RPC, full ecosystem compat.

## 2. Inspect the smart account

The dashboard auto-derives a scheme-1 keypair (browser localStorage)
and computes the deterministic CREATE2 address for the user's smart
account using `AccountFactory.predict_address`. The four cards show:

| Card | What |
|---|---|
| ECDSA owner | Your EOA |
| PQ pubkey hash | `keccak256(pubkey)` of your local scheme-1 key |
| Smart account | Deterministic future address |
| Verifier registry | The swappable indirection |

## 3. LOW-tag tx — "ECDSA still works"

Send `0.001 ETH` to the configured bridge target. Click **Classify** → tag
shows **LOW**. Click **Sign & send** → MetaMask shows one ECDSA prompt.
The op executes; `UserOpExecuted` shows up in the history with a green
LOW pill.

## 4. HIGH-tag tx — "PQ becomes mandatory"

Bump value to `5 ETH` (above the 1 ETH high-threshold). **Classify** →
**HIGH**. **Sign & send**. Two prompts: ECDSA via MetaMask, then a
silent in-browser PQ signature (scheme 1). Op executes. History entry
shows an amber HIGH pill.

**Show**: open dev tools, watch the `signatures` calldata. It is
`abi.encode(EcdsaSig, PqSig)` with both fields populated.

## 5. Reject PQ — "the validator enforces the policy"

Open the Falcon storage in DevTools localStorage and overwrite the
secret bytes. Re-send the same HIGH op. Tx reverts with `INVALID_PQ`
in the trace. Restore the original key.

## 6. Swap the verifier — "we never have to redeploy wallets"

In a separate terminal:

```bash
# Deploy a second reference verifier instance
cd contracts-stylus/pq-verifier && cargo stylus deploy ...

# Point the registry at it
cast send <REGISTRY> 'set_verifier(uint16,address)' 1 <NEW_VERIFIER> \
  --rpc-url http://localhost:8547 --private-key 0x...
```

Re-run step 4. Same wallet, same SDK, new verifier. This is the
upgrade path to real Falcon-512 / a Nitro precompile.

## 7. CRITICAL — "rotation under timelock"

In the dashboard (or via cast), call:

```
NexoraAccount.propose_pq_pubkey_rotation(newHash, scheme=1, oldSig, oldPubkey)
```

Wait 60 seconds. Call:

```
NexoraAccount.commit_pq_pubkey_rotation()
```

`PqPubkeyRotated` event fires; future PQ ops use the new key.

## 8. Agent demo — "this is what an AI runs against"

```bash
OWNER_PRIVATE_KEY=0x... pnpm --filter @nexora/agent demo
```

The agent walks three intents (LOW / HIGH / CRITICAL) through the SDK
into the wallet. The dashboard's op history streams them in real time
via the `IntentExecuted` event with the agent's id. Tag distribution is
visible on the audit log.

## Backup plan

If the local chain misbehaves:

- `WITH_EXPLORER=1 ./scripts/dev-up.sh` for Blockscout debugging
- `pnpm --filter @nexora/relayer dev` and switch the SDK to `relayerUrl`
  mode — bypasses MetaMask entirely
- Fall back to `cast call` against deployed contract addresses to show
  the validator behaviour at the protocol level

## Talking points (60 seconds)

> "Nexora separates **what to validate** (policy engine) from **how to
> validate** (verifier registry). Today the registry resolves to a
> Stylus reference verifier; it can resolve to Falcon-512 or a Nitro
> precompile. Wallet bytecode is unchanged. SDK calls are unchanged.
> Hybrid ECDSA + PQ means we don't break ecosystem compatibility while
> we phase in post-quantum security."
