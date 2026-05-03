export declare const accountFactoryAbi: readonly [{
    readonly type: "function";
    readonly name: "init";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "owner";
        readonly type: "address";
    }, {
        readonly name: "implementation";
        readonly type: "address";
    }, {
        readonly name: "verifierRegistry";
        readonly type: "address";
    }, {
        readonly name: "policyEngine";
        readonly type: "address";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "predictAddress";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "owner";
        readonly type: "address";
    }, {
        readonly name: "pqPubkeyHash";
        readonly type: "bytes32";
    }, {
        readonly name: "userSalt";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly type: "function";
    readonly name: "createAccount";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "owner";
        readonly type: "address";
    }, {
        readonly name: "pqPubkeyHash";
        readonly type: "bytes32";
    }, {
        readonly name: "userSalt";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly type: "function";
    readonly name: "implementation";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly type: "event";
    readonly name: "AccountCreated";
    readonly inputs: readonly [{
        readonly name: "account";
        readonly type: "address";
        readonly indexed: true;
    }, {
        readonly name: "owner";
        readonly type: "address";
        readonly indexed: true;
    }, {
        readonly name: "pqPubkeyHash";
        readonly type: "bytes32";
        readonly indexed: false;
    }, {
        readonly name: "salt";
        readonly type: "bytes32";
        readonly indexed: false;
    }];
}];
//# sourceMappingURL=accountFactory.d.ts.map