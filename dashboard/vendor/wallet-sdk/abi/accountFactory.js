export const accountFactoryAbi = [
    {
        type: "function",
        name: "init",
        stateMutability: "nonpayable",
        inputs: [
            { name: "owner", type: "address" },
            { name: "implementation", type: "address" },
            { name: "verifierRegistry", type: "address" },
            { name: "policyEngine", type: "address" },
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "predictAddress",
        stateMutability: "view",
        inputs: [
            { name: "owner", type: "address" },
            { name: "pqPubkeyHash", type: "bytes32" },
            { name: "userSalt", type: "bytes32" },
        ],
        outputs: [{ type: "address" }],
    },
    {
        type: "function",
        name: "createAccount",
        stateMutability: "nonpayable",
        inputs: [
            { name: "owner", type: "address" },
            { name: "pqPubkeyHash", type: "bytes32" },
            { name: "userSalt", type: "bytes32" },
        ],
        outputs: [{ type: "address" }],
    },
    {
        type: "function",
        name: "implementation",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "address" }],
    },
    {
        type: "event",
        name: "AccountCreated",
        inputs: [
            { name: "account", type: "address", indexed: true },
            { name: "owner", type: "address", indexed: true },
            { name: "pqPubkeyHash", type: "bytes32", indexed: false },
            { name: "salt", type: "bytes32", indexed: false },
        ],
    },
];
//# sourceMappingURL=accountFactory.js.map