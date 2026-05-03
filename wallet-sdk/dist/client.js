import { bytesToHex, encodeAbiParameters, zeroHash, } from "viem";
import { PolicyTag, VerifierScheme, } from "./types.js";
import { computeOpHash } from "./opHash.js";
import { onchainClassify } from "./policy.js";
import { signEcdsaOpHash } from "./signers/ecdsa.js";
import { signFalconMock, } from "./signers/falconMock.js";
import { signFalcon512, } from "./signers/falcon512.js";
import { encodeSignatures } from "./signers/envelope.js";
import { nexoraAccountAbi } from "./abi/nexoraAccount.js";
export class NexoraClient {
    config;
    constructor(config) {
        this.config = config;
    }
    /// Dispatch PQ signing to the configured backend (scheme 1 vs Falcon-512).
    async signPq(opHash, scheme) {
        if (scheme === VerifierScheme.Falcon512) {
            // Prefer an injected signer (browser wasm, HSM, ...). Fall back to
            // the daemon path bound to `pqKeypair`.
            if (this.config.falcon512Signer) {
                return this.config.falcon512Signer.signOp(opHash);
            }
            return signFalcon512(opHash, this.config.pqKeypair, this.config.falcon512);
        }
        // Scheme 1 (or unknown PQ scheme defaults here).
        return signFalconMock(opHash, this.config.pqKeypair);
    }
    async nextNonce(channel) {
        const v = (await this.config.publicClient.readContract({
            address: this.config.account,
            abi: nexoraAccountAbi,
            functionName: "getNonce",
            args: [channel],
        }));
        return v + 1n;
    }
    /**
     * Build, classify, and sign a UserOp without broadcasting.
     */
    async prepare(input) {
        const data = input.callData ?? "0x";
        const value = input.value ?? 0n;
        const target = input.target;
        const tag = input.forceTag ??
            (await onchainClassify(this.config.publicClient, this.config.policyEngine, this.config.account, target, value, data));
        const channel = tag === PolicyTag.Low ? 0n : 1n;
        const nonce = await this.nextNonce(channel);
        const scheme = this.config.scheme ?? VerifierScheme.FalconMock;
        const op = {
            sender: this.config.account,
            nonce,
            target,
            value,
            callData: data,
            callGasLimit: input.callGasLimit ?? 1000000n,
            validUntil: input.validUntil ?? 0n,
            policyTag: tag,
            verifierScheme: scheme,
            signatures: "0x",
        };
        const chainId = BigInt((await this.config.publicClient.getChainId().catch(() => 412346)));
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
        const pqPubkey = bytesToHex(this.config.pqKeypair.publicKey);
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
    async submit(signed) {
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
            const j = (await res.json());
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
    async execute(input) {
        const signed = await this.prepare(input);
        const txHash = await this.submit(signed);
        return { signed, txHash };
    }
}
/// JSON-safe serialization of a UserOp (BigInt -> string).
export function serializeOp(op) {
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
];
export function encodeUserOp(op) {
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
export function deserializeOp(o) {
    return {
        sender: o.sender,
        nonce: BigInt(o.nonce),
        target: o.target,
        value: BigInt(o.value),
        callData: o.callData,
        callGasLimit: BigInt(o.callGasLimit),
        validUntil: BigInt(o.validUntil),
        policyTag: o.policyTag,
        verifierScheme: o.verifierScheme,
        signatures: o.signatures,
    };
}
//# sourceMappingURL=client.js.map