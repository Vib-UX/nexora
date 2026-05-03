import { hexToBytes, serializeSignature, toHex, } from "viem";
import { sign } from "viem/accounts";
function isWalletClientSigner(s) {
    return (typeof s.walletClient === "object" &&
        s.walletClient !== null &&
        typeof s.account === "object");
}
/**
 * Sign a Nexora opHash using EIP-191 ("Ethereum Signed Message:\n32" prefix).
 * The on-chain validator wraps the same prefix before `ecrecover`, so this
 * matches `personal_sign` behaviour from MetaMask.
 */
export async function signEcdsaOpHash(signer, opHash) {
    const message = { raw: hexToBytes(opHash) };
    if (isWalletClientSigner(signer)) {
        const flat = await signer.walletClient.signMessage({
            account: signer.account,
            message,
        });
        return splitSig(flat);
    }
    if (!signer.signMessage) {
        throw new Error("ecdsa signer does not support signMessage — pass { walletClient, account } instead");
    }
    const flat = await signer.signMessage({ message });
    return splitSig(flat);
}
/**
 * Sign a digest directly with a private-key viem account
 * (no EIP-191 prefix). Mostly used in tests.
 */
export async function signDigestPrivateKey(privateKey, digest) {
    const sig = await sign({ hash: digest, privateKey });
    return splitSig(serializeSignature(sig));
}
export function splitSig(flat) {
    const bytes = hexToBytes(flat);
    if (bytes.length !== 65) {
        throw new Error(`expected 65-byte sig, got ${bytes.length}`);
    }
    return {
        r: toHex(bytes.slice(0, 32)),
        s: toHex(bytes.slice(32, 64)),
        v: bytes[64],
    };
}
//# sourceMappingURL=ecdsa.js.map