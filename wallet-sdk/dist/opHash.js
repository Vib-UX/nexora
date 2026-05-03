import { encodeAbiParameters, keccak256, toBytes, toHex, concat, pad, parseAbiParameters, } from "viem";
/// keccak256("Nexora") as a static string.
const NEXORA_NAME = "Nexora";
const NEXORA_VERSION = "1";
const EIP712_DOMAIN_TYPEHASH = keccak256(toBytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
const USEROP_TYPEHASH = keccak256(toBytes("UserOp(address sender,uint256 nonce,address target,uint256 value,bytes callData,uint256 callGasLimit,uint256 validUntil,uint8 policyTag,uint16 verifierScheme)"));
export function domainSeparator(chainId, account) {
    return keccak256(encodeAbiParameters(parseAbiParameters("bytes32, bytes32, bytes32, uint256, address"), [
        EIP712_DOMAIN_TYPEHASH,
        keccak256(toBytes(NEXORA_NAME)),
        keccak256(toBytes(NEXORA_VERSION)),
        chainId,
        account,
    ]));
}
export function structHash(op) {
    const calldataHash = keccak256(op.callData);
    return keccak256(encodeAbiParameters(parseAbiParameters("bytes32, address, uint256, address, uint256, bytes32, uint256, uint256, uint8, uint16"), [
        USEROP_TYPEHASH,
        op.sender,
        op.nonce,
        op.target,
        op.value,
        calldataHash,
        op.callGasLimit,
        op.validUntil,
        op.policyTag,
        op.verifierScheme,
    ]));
}
/**
 * Compute the EIP-712 op hash a Nexora wallet expects.
 *
 * @param op       UserOp (signatures field is ignored)
 * @param chainId  Chain id (e.g. 20056n for Nexora Devnet)
 * @param account  Address of the smart account that will validate the op
 */
export function computeOpHash(op, chainId, account) {
    const ds = domainSeparator(chainId, account);
    const sh = structHash(op);
    return keccak256(concat([toHex("\x19\x01"), ds, sh]));
}
/// 32-byte left-padded uint helper for tag/scheme fields.
export function padU8(v) {
    return pad(toHex(v), { size: 32 });
}
//# sourceMappingURL=opHash.js.map