export const pqVerifierAbi = [
    { type: "function", name: "scheme", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
    { type: "function", name: "pubkeyLength", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
    { type: "function", name: "sigLength", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
    {
        type: "function",
        name: "verify",
        stateMutability: "view",
        inputs: [
            { name: "msgHash", type: "bytes32" },
            { name: "sig", type: "bytes" },
            { name: "pubkey", type: "bytes" },
        ],
        outputs: [{ type: "bool" }],
    },
    {
        type: "function",
        name: "pubkeyCommitment",
        stateMutability: "view",
        inputs: [{ name: "pubkey", type: "bytes" }],
        outputs: [{ type: "bytes32" }],
    },
    {
        type: "function",
        name: "init",
        stateMutability: "nonpayable",
        inputs: [
            { name: "owner", type: "address" },
            { name: "strict", type: "bool" },
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "setReportedScheme",
        stateMutability: "nonpayable",
        inputs: [{ name: "newScheme", type: "uint16" }],
        outputs: [],
    },
];
//# sourceMappingURL=pqVerifier.js.map