export const verifierRegistryAbi = [
    {
        type: "function",
        name: "init",
        stateMutability: "nonpayable",
        inputs: [{ name: "owner", type: "address" }],
        outputs: [],
    },
    {
        type: "function",
        name: "verifier",
        stateMutability: "view",
        inputs: [{ name: "scheme", type: "uint16" }],
        outputs: [{ type: "address" }],
    },
    {
        type: "function",
        name: "setVerifier",
        stateMutability: "nonpayable",
        inputs: [
            { name: "scheme", type: "uint16" },
            { name: "implAddr", type: "address" },
        ],
        outputs: [],
    },
    { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
    {
        type: "event",
        name: "VerifierUpdated",
        inputs: [
            { name: "scheme", type: "uint16", indexed: true },
            { name: "implAddr", type: "address", indexed: true },
        ],
    },
];
//# sourceMappingURL=verifierRegistry.js.map