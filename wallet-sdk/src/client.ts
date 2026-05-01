import {
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  bytesToHex,
  encodeAbiParameters,
  zeroHash,
} from "viem";
import {
  type UserOp,
  type SignatureEnvelope,
  PolicyTag,
  VerifierScheme,
} from "./types.js";
import { computeOpHash } from "./opHash.js";
import { onchainClassify } from "./policy.js";
import { signEcdsaOpHash } from "./signers/ecdsa.js";
import {
  type FalconMockKeypair,
  signFalconMock,
} from "./signers/falconMock.js";
import {
  type Falcon512Keypair,
  type Falcon512SignOpts,
  type Falcon512Signer,
  signFalcon512,
} from "./signers/falcon512.js";
import { encodeSignatures } from "./signers/envelope.js";
import { nexoraAccountAbi } from "./abi/nexoraAccount.js";
import type { PqSig } from "./types.js";

export interface NexoraClientConfig {
  publicClient: PublicClient;
  walletClient: WalletClient;
  /// Address of the deployed smart account (NexoraAccount).
  account: Address;
  /// Address of the policy engine (used by the SDK for pre-classification).
  policyEngine: Address;
  /**
   * PQ keypair held client-side. Shape depends on `scheme`:
   *   - FalconMock  → `FalconMockKeypair` (deterministic scheme-1 keypair)
   *   - Falcon512   → `Falcon512Keypair` (real keypair; signing happens via
   *                    the local `falcon-signer` daemon)
   */
  pqKeypair: FalconMockKeypair | Falcon512Keypair;
  /// Owner EOA used for ECDSA signatures.
  owner: Account;
  /// Verifier scheme to request when PQ is required (default = scheme 1).
  scheme?: VerifierScheme;
  /// Optional relayer URL — when set, ops POST to it instead of going
  /// through the connected wallet.
  relayerUrl?: string;
  /// Optional Falcon-512 signer-daemon options (URL, fetch override).
  falcon512?: Falcon512SignOpts;
  /**
   * Optional pre-built Falcon-512 signer (browser-wasm or external HSM).
   * When set, takes precedence over the daemon-based default. The signer's
   * `publicKey` MUST match `pqKeypair.publicKey` for scheme 2 — the SDK
   * does not re-fetch keys here.
   */
  falcon512Signer?: Falcon512Signer;
}

export interface BuildOpInput {
  target: Address;
  value?: bigint;
  callData?: Hex;
  callGasLimit?: bigint;
  validUntil?: bigint;
  /// Force a specific policy tag (otherwise inferred via on-chain engine).
  forceTag?: PolicyTag;
}

export interface SignedUserOp {
  op: UserOp;
  opHash: Hex;
  tag: PolicyTag;
  envelope: SignatureEnvelope;
  /// Raw PQ pubkey, passed alongside the op for verifier resolution.
  pqPubkey: Hex;
}

export class NexoraClient {
  constructor(public readonly config: NexoraClientConfig) {}

  /// Dispatch PQ signing to the configured backend (scheme 1 vs Falcon-512).
  private async signPq(opHash: Hex, scheme: VerifierScheme): Promise<PqSig> {
    if (scheme === VerifierScheme.Falcon512) {
      // Prefer an injected signer (browser wasm, HSM, ...). Fall back to
      // the daemon path bound to `pqKeypair`.
      if (this.config.falcon512Signer) {
        return this.config.falcon512Signer.signOp(opHash);
      }
      return signFalcon512(
        opHash,
        this.config.pqKeypair as Falcon512Keypair,
        this.config.falcon512,
      );
    }
    // Scheme 1 (or unknown PQ scheme defaults here).
    return signFalconMock(opHash, this.config.pqKeypair as FalconMockKeypair);
  }

  async nextNonce(channel: bigint): Promise<bigint> {
    const v = (await this.config.publicClient.readContract({
      address: this.config.account,
      abi: nexoraAccountAbi,
      functionName: "getNonce",
      args: [channel],
    })) as bigint;
    return v + 1n;
  }

  /**
   * Build, classify, and sign a UserOp without broadcasting.
   */
  async prepare(input: BuildOpInput): Promise<SignedUserOp> {
    const data: Hex = input.callData ?? "0x";
    const value = input.value ?? 0n;
    const target = input.target;

    const tag =
      input.forceTag ??
      (await onchainClassify(
        this.config.publicClient,
        this.config.policyEngine,
        this.config.account,
        target,
        value,
        data,
      ));

    const channel = tag === PolicyTag.Low ? 0n : 1n;
    const nonce = await this.nextNonce(channel);

    const scheme = this.config.scheme ?? VerifierScheme.FalconMock;

    const op: UserOp = {
      sender: this.config.account,
      nonce,
      target,
      value,
      callData: data,
      callGasLimit: input.callGasLimit ?? 1_000_000n,
      validUntil: input.validUntil ?? 0n,
      policyTag: tag,
      verifierScheme: scheme,
      signatures: "0x",
    };

    const chainId = BigInt(
      (await this.config.publicClient.getChainId().catch(() => 412346)) as number,
    );
    const opHash = computeOpHash(op, chainId, this.config.account);

    let ecdsaSig = null;
    let pqSig = null;

    if (tag === PolicyTag.Low || tag === PolicyTag.High) {
      ecdsaSig = await signEcdsaOpHash(this.config.owner, opHash);
    }
    if (tag === PolicyTag.High || tag === PolicyTag.Critical) {
      pqSig = await this.signPq(opHash, scheme);
    }

    op.signatures = encodeSignatures(ecdsaSig, pqSig);
    const pqPubkey = bytesToHex(
      (this.config.pqKeypair as { publicKey: Uint8Array }).publicKey,
    );

    return {
      op,
      opHash,
      tag,
      envelope: {
        ecdsa: ecdsaSig ?? {
          r: zeroHash,
          s: zeroHash,
          v: 0,
        },
        pq: pqSig ?? {
          scheme: 0,
          pubkeyHash: zeroHash,
          sigBytes: "0x",
        },
      },
      pqPubkey: tag === PolicyTag.Low ? "0x" : pqPubkey,
    };
  }

  /**
   * Submit a prepared op. If a `relayerUrl` is configured, POSTs to it;
   * otherwise sends the tx directly with the connected wallet client.
   */
  async submit(signed: SignedUserOp): Promise<Hex> {
    if (this.config.relayerUrl) {
      const res = await fetch(`${this.config.relayerUrl}/op`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          op: serializeOp(signed.op),
          providedPubkey: signed.pqPubkey,
        }),
      });
      if (!res.ok) {
        throw new Error(`relayer error: ${res.status} ${await res.text()}`);
      }
      const j = (await res.json()) as { txHash: Hex };
      return j.txHash;
    }

    const wallet = this.config.walletClient;
    if (!wallet.account) {
      throw new Error("walletClient.account is required");
    }
    const opBytes = encodeUserOp(signed.op);
    const txHash = await wallet.writeContract({
      address: this.config.account,
      abi: nexoraAccountAbi,
      functionName: "executeUserOp",
      args: [opBytes, signed.pqPubkey],
      account: wallet.account,
      chain: wallet.chain,
      value: signed.op.value,
    });
    return txHash;
  }

  /**
   * One-shot: prepare + submit.
   */
  async execute(input: BuildOpInput): Promise<{ signed: SignedUserOp; txHash: Hex }> {
    const signed = await this.prepare(input);
    const txHash = await this.submit(signed);
    return { signed, txHash };
  }
}

/// JSON-safe serialization of a UserOp (BigInt -> string).
export function serializeOp(op: UserOp): Record<string, unknown> {
  return {
    sender: op.sender,
    nonce: op.nonce.toString(),
    target: op.target,
    value: op.value.toString(),
    callData: op.callData,
    callGasLimit: op.callGasLimit.toString(),
    validUntil: op.validUntil.toString(),
    policyTag: op.policyTag,
    verifierScheme: op.verifierScheme,
    signatures: op.signatures,
  };
}

/// ABI-encode a UserOp into the `bytes` shape the on-chain contract expects.
/// Mirrors the `sol! { struct UserOp { ... } }` layout in
/// `contracts-stylus/shared/src/types.rs`.
const USER_OP_ABI_TYPE = [
  {
    type: "tuple",
    components: [
      { name: "sender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
      { name: "callData", type: "bytes" },
      { name: "callGasLimit", type: "uint256" },
      { name: "validUntil", type: "uint256" },
      { name: "policyTag", type: "uint8" },
      { name: "verifierScheme", type: "uint16" },
      { name: "signatures", type: "bytes" },
    ],
  },
] as const;

export function encodeUserOp(op: UserOp): Hex {
  return encodeAbiParameters(USER_OP_ABI_TYPE, [
    {
      sender: op.sender,
      nonce: op.nonce,
      target: op.target,
      value: op.value,
      callData: op.callData,
      callGasLimit: op.callGasLimit,
      validUntil: op.validUntil,
      policyTag: op.policyTag,
      verifierScheme: op.verifierScheme,
      signatures: op.signatures,
    },
  ]);
}

export function deserializeOp(o: Record<string, unknown>): UserOp {
  return {
    sender: o.sender as Address,
    nonce: BigInt(o.nonce as string),
    target: o.target as Address,
    value: BigInt(o.value as string),
    callData: o.callData as Hex,
    callGasLimit: BigInt(o.callGasLimit as string),
    validUntil: BigInt(o.validUntil as string),
    policyTag: o.policyTag as PolicyTag,
    verifierScheme: o.verifierScheme as VerifierScheme,
    signatures: o.signatures as Hex,
  };
}
