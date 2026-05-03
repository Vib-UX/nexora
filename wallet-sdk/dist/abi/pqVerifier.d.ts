export declare const pqVerifierAbi: readonly [{
    readonly type: "function";
    readonly name: "scheme";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint16";
    }];
}, {
    readonly type: "function";
    readonly name: "pubkeyLength";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint16";
    }];
}, {
    readonly type: "function";
    readonly name: "sigLength";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint16";
    }];
}, {
    readonly type: "function";
    readonly name: "verify";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "msgHash";
        readonly type: "bytes32";
    }, {
        readonly name: "sig";
        readonly type: "bytes";
    }, {
        readonly name: "pubkey";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly type: "function";
    readonly name: "pubkeyCommitment";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "pubkey";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [{
        readonly type: "bytes32";
    }];
}, {
    readonly type: "function";
    readonly name: "init";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "owner";
        readonly type: "address";
    }, {
        readonly name: "strict";
        readonly type: "bool";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "setReportedScheme";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "newScheme";
        readonly type: "uint16";
    }];
    readonly outputs: readonly [];
}];
//# sourceMappingURL=pqVerifier.d.ts.map