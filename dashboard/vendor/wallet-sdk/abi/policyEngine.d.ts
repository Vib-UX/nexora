export declare const policyEngineAbi: readonly [{
    readonly type: "function";
    readonly name: "classify";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "account";
        readonly type: "address";
    }, {
        readonly name: "target";
        readonly type: "address";
    }, {
        readonly name: "value";
        readonly type: "uint256";
    }, {
        readonly name: "data";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [{
        readonly type: "uint8";
    }];
}, {
    readonly type: "function";
    readonly name: "owner";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly type: "function";
    readonly name: "setThresholds";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "high";
        readonly type: "uint256";
    }, {
        readonly name: "critical";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "setHighTarget";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "target";
        readonly type: "address";
    }, {
        readonly name: "on";
        readonly type: "bool";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "setCriticalTarget";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "target";
        readonly type: "address";
    }, {
        readonly name: "on";
        readonly type: "bool";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "setHighSelector";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "selector";
        readonly type: "bytes4";
    }, {
        readonly name: "on";
        readonly type: "bool";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "setCriticalSelector";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "selector";
        readonly type: "bytes4";
    }, {
        readonly name: "on";
        readonly type: "bool";
    }];
    readonly outputs: readonly [];
}];
//# sourceMappingURL=policyEngine.d.ts.map