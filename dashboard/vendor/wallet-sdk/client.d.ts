import { type Account, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { type UserOp, type SignatureEnvelope, PolicyTag, VerifierScheme } from "./types.js";
import { type FalconMockKeypair } from "./signers/falconMock.js";
import { type Falcon512Keypair, type Falcon512SignOpts, type Falcon512Signer } from "./signers/falcon512.js";
export interface NexoraClientConfig {
    publicClient: PublicClient;
    walletClient: WalletClient;
    account: Address;
    policyEngine: Address;
    /**
     * PQ keypair held client-side. Shape depends on `scheme`:
     *   - FalconMock  → `FalconMockKeypair` (deterministic scheme-1 keypair)
     *   - Falcon512   → `Falcon512Keypair` (real keypair; signing happens via
     *                    the local `falcon-signer` daemon)
     */
    pqKeypair: FalconMockKeypair | Falcon512Keypair;
    owner: Account;
    scheme?: VerifierScheme;
    relayerUrl?: string;
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
    forceTag?: PolicyTag;
}
export interface SignedUserOp {
    op: UserOp;
    opHash: Hex;
    tag: PolicyTag;
    envelope: SignatureEnvelope;
    pqPubkey: Hex;
}
export declare class NexoraClient {
    readonly config: NexoraClientConfig;
    constructor(config: NexoraClientConfig);
    private signPq;
    nextNonce(channel: bigint): Promise<bigint>;
    /**
     * Build, classify, and sign a UserOp without broadcasting.
     */
    prepare(input: BuildOpInput): Promise<SignedUserOp>;
    /**
     * Submit a prepared op. If a `relayerUrl` is configured, POSTs to it;
     * otherwise sends the tx directly with the connected wallet client.
     */
    submit(signed: SignedUserOp): Promise<Hex>;
    /**
     * One-shot: prepare + submit.
     */
    execute(input: BuildOpInput): Promise<{
        signed: SignedUserOp;
        txHash: Hex;
    }>;
}
export declare function serializeOp(op: UserOp): Record<string, unknown>;
export declare function encodeUserOp(op: UserOp): Hex;
export declare function deserializeOp(o: Record<string, unknown>): UserOp;
//# sourceMappingURL=client.d.ts.map