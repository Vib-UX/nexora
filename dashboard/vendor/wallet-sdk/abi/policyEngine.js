export const policyEngineAbi = [
    {
        type: "function",
        name: "classify",
        stateMutability: "view",
        inputs: [
            { name: "account", type: "address" },
            { name: "target", type: "address" },
            { name: "value", type: "uint256" },
            { name: "data", type: "bytes" },
        ],
        outputs: [{ type: "uint8" }],
    },
    { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
    {
        type: "function",
        name: "setThresholds",
        stateMutability: "nonpayable",
        inputs: [
            { name: "high", type: "uint256" },
            { name: "critical", type: "uint256" },
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "setHighTarget",
        stateMutability: "nonpayable",
        inputs: [
            { name: "target", type: "address" },
            { name: "on", type: "bool" },
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "setCriticalTarget",
        stateMutability: "nonpayable",
        inputs: [
            { name: "target", type: "address" },
            { name: "on", type: "bool" },
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "setHighSelector",
        stateMutability: "nonpayable",
        inputs: [
            { name: "selector", type: "bytes4" },
            { name: "on", type: "bool" },
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "setCriticalSelector",
        stateMutability: "nonpayable",
        inputs: [
            { name: "selector", type: "bytes4" },
            { name: "on", type: "bool" },
        ],
        outputs: [],
    },
];
//# sourceMappingURL=policyEngine.js.map