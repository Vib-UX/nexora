export declare const verifierRegistryAbi: readonly [{
    readonly type: "function";
    readonly name: "init";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "owner";
        readonly type: "address";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "verifier";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "scheme";
        readonly type: "uint16";
    }];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly type: "function";
    readonly name: "setVerifier";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "scheme";
        readonly type: "uint16";
    }, {
        readonly name: "implAddr";
        readonly type: "address";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "owner";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly type: "event";
    readonly name: "VerifierUpdated";
    readonly inputs: readonly [{
        readonly name: "scheme";
        readonly type: "uint16";
        readonly indexed: true;
    }, {
        readonly name: "implAddr";
        readonly type: "address";
        readonly indexed: true;
    }];
}];
//# sourceMappingURL=verifierRegistry.d.ts.map