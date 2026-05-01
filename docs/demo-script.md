# Nexora — Walkthrough

Total runtime target: 5 minutes. Every step has an objective + a fallback.
The dashboard is now self-driving: visitors generate keys, deploy their
smart account, fund it, and exercise all three policy bands without
running a CLI.

## Pre-flight

```bash
pnpm install
./scripts/dev-up.sh                              # boots local Nitro + RPC at :8547
DEPLOYER_PRIVATE_KEY=0x... pnpm tsx scripts/deploy-all.ts
pnpm --filter @nexora/dashboard dev              # http://localhost:3000
```

You will need:

- MetaMask (or any injected EVM wallet)
- A funded EOA on the Nexora devnet (use the dev faucet or one of the
  pre-funded genesis accounts in `chain/data/`)

The Falcon-512 wasm bundle is committed under
`dashboard/public/wasm/falcon512/`, so the dashboard can keygen and sign
client-side without any external process. Run `pnpm wasm:build` only if
you've changed the `signer/falcon-signer-wasm` crate.

## 1. Connect — "this is a normal EVM chain"

Open `http://localhost:3000`. Click **+ add Nexora Devnet to wallet**.
This calls `wallet_addEthereumChain` with the configured chain id.
MetaMask shows a generic chain prompt. Approve.

**Why this matters**: the post-quantum machinery is invisible to the
wallet. Standard tooling, standard RPC, full ecosystem compatibility.

## 2. Generate a real Falcon-512 keypair

In the **Falcon-512 keypair** card click **Generate Falcon-512 keypair**.
The browser runs the `wasm-bindgen` bundle (compiled from
`signer/falcon-signer-wasm`) and produces:

| Field | Value |
|---|---|
| Public key | 897 bytes (NIST PQC Falcon-512) |
| Secret key | 1281 bytes |
| Commitment | `keccak256(publicKey)` |

The badge in the top-right reads `signer · browser-wasm`. The secret
sits in `localStorage` under `nexora.falcon512.sk.v1` for the rest of
the demo session — clearing it is one click away.

**Talking point**: this is not a stub or a deterministic test vector.
The same keypair is what the on-chain `pq-verifier-falcon512` will
verify against in step 4.

## 3. Deploy your smart account

The **Smart account** card already shows the predicted CREATE2 address
(`AccountFactory.predict_address(owner, falcon512Hash, 0x0)`). Click
**Deploy smart account**. MetaMask prompts for a single tx; the badge
flips from `predicted · not deployed` to `deployed`.

**Why CREATE2**: the address is fully a function of the connected EOA
and the Falcon-512 commitment, so re-generating keys produces a fresh
account, and re-running the demo on a new chain reproduces the same
address.

## 4. Fund the account

The **Fund smart account** card shows the live balance (auto-refreshes
every 6 s). Pick a quick amount (`0.01` ETH is plenty for the demo) and
click **Send from MetaMask**. The card calls the wallet's payable
`fund()` selector — Stylus 0.6 doesn't expose a bare `receive()`, so
plain transfers wouldn't credit the balance.

## 5. LOW-tag tx — "ECDSA still works"

In **Send transaction** click the **LOW · 0.001 ETH** preset and **Sign
& send**. The pipeline lights up step by step:

```
1 · classify policy   →  LOW
2 · build UserOp      →  nonce=1 · chainId=...
3 · sign ECDSA        →  65 B
4 · sign Falcon-512   →  skipped (LOW = ECDSA only)
5 · submit            →  tx 0x...
6 · confirm           →  block N · gas used
```

`UserOpExecuted` lands in the **Op history** pane with a green LOW pill.

## 6. HIGH-tag tx — "PQ becomes mandatory"

Click **HIGH · 0.05 ETH + calldata** and **Sign & send**. Step 4 now
runs. The pipeline shows:

```
3 · sign ECDSA        →  65 B · v=27           (12 ms)
4 · sign Falcon-512   →  666 B real Falcon sig · source=browser-wasm  (35 ms)
5 · submit            →  tx 0x...
```

The `666 B real Falcon sig + 65 B ECDSA submitted` annotation makes the
real PQ payload visible. On-chain, `pq-verifier-falcon512` runs the
NTT, hash-to-point, and norm check before the op is allowed to execute.

**Show the calldata**: open dev tools, watch the `signatures` field on
the tx. It is `abi.encode(EcdsaSig, PqSig)` with both populated; the PQ
field is the canonical `0x39` Falcon-512 signature header (or `0x59`
under FIPS-206).

## 7. CRITICAL — "PQ-only path"

Click **CRITICAL · 0.5 ETH** and **Sign & send**. Step 3 now reports
`skipped (CRITICAL = PQ-only)` — at this risk level the wallet rejects
ECDSA and only honours Falcon-512.

(Optional) Walk the rotation flow via `cast` from a side terminal:

```
NexoraAccount.proposeOwnerRotation(newOwner, scheme=2, pqSig, pqPubkey)
# wait 60 seconds
NexoraAccount.commitOwnerRotation()
```

`OwnerRotated` event fires; future ops are signed by the new owner.

## 8. Reject PQ — "the validator enforces the policy"

Open DevTools → Application → Local Storage → `nexora.falcon512.sk.v1`
and flip a single byte in the `secretKey` value. Click **Sign & send**
again. Step 4 produces a signature, step 5 submits, step 6 reverts with
`INVALID_PQ` in the trace. Click **Re-generate** in the Keygen card to
restore a working key.

## 9. Swap the verifier — "we never have to redeploy wallets"

In a separate terminal, point the registry at a fresh Falcon-512
instance:

```bash
cd contracts-stylus/pq-verifier-falcon512 && cargo stylus deploy ...
cast send <REGISTRY> 'setVerifier(uint16,address)' 2 <NEW_VERIFIER> \
  --rpc-url http://localhost:8547 --private-key 0x...
```

Re-run step 6. Same wallet, same SDK, new verifier. This is the upgrade
path to a Nitro `falcon512_verify` precompile (see
[`docs/falcon-precompile-roadmap.md`](falcon-precompile-roadmap.md)).

## 10. Agent demo — "this is what an AI runs against"

```bash
OWNER_PRIVATE_KEY=0x... FALCON_SCHEME=2 pnpm agent:demo
```

The agent walks three intents (LOW / HIGH / CRITICAL) through the SDK.
With `FALCON_SCHEME=2` it uses the local `falcon-signer` daemon
(`signer/falcon-signer`, default `http://127.0.0.1:9090`). The
dashboard's op history streams them in real time via `IntentExecuted`.

## Offline / fallback paths

- **Wasm bundle won't load** (older browser, exotic origin): the
  Keygen card's badge flips to `signer · daemon` and signing routes
  through `falcon-signer serve`. Start it once with:
  ```bash
  cd signer/falcon-signer
  cargo run --release -- keygen --out keys.json
  cargo run --release -- serve --keys keys.json --addr 127.0.0.1:9090
  ```
- **Local chain misbehaves**: `WITH_EXPLORER=1 ./scripts/dev-up.sh`
  for Blockscout debugging.
- **MetaMask out of reach**: `pnpm --filter @nexora/relayer dev` and
  switch the SDK to `relayerUrl` mode for sponsor-relayed submission.

## Talking points (60 seconds)

> "Nexora separates **what to validate** (policy engine) from **how to
> validate** (verifier registry). Today the registry resolves scheme `2`
> to a Stylus Falcon-512 verifier; tomorrow it can resolve to a Nitro
> precompile. Wallet bytecode is unchanged. SDK calls are unchanged.
> Hybrid ECDSA + Falcon-512 means we don't break ecosystem compatibility
> while we phase in post-quantum security. Keys live in the user's
> browser, signing happens client-side via wasm, and 666-byte Falcon
> signatures land on-chain in a single transaction."
