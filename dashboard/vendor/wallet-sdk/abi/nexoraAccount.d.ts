export declare const nexoraAccountAbi: readonly [{
    readonly type: "function";
    readonly name: "init";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "owner";
        readonly type: "address";
    }, {
        readonly name: "pqPubkeyHash";
        readonly type: "bytes32";
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
    readonly name: "fund";
    readonly stateMutability: "payable";
    readonly inputs: readonly [];
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
    readonly type: "function";
    readonly name: "pqPubkeyHash";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "bytes32";
    }];
}, {
    readonly type: "function";
    readonly name: "verifierRegistry";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly type: "function";
    readonly name: "policyEngine";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly type: "function";
    readonly name: "getNonce";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "channel";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "executeUserOp";
    readonly stateMutability: "payable";
    readonly inputs: readonly [{
        readonly name: "opBytes";
        readonly type: "bytes";
    }, {
        readonly name: "providedPubkey";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly type: "function";
    readonly name: "executeIntent";
    readonly stateMutability: "payable";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
    }, {
        readonly name: "opBytes";
        readonly type: "bytes";
    }, {
        readonly name: "providedPubkey";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly type: "function";
    readonly name: "validateUserOp";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "opBytes";
        readonly type: "bytes";
    }, {
        readonly name: "providedPubkey";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "isValidSignature";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "hash";
        readonly type: "bytes32";
    }, {
        readonly name: "sig";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [{
        readonly type: "bytes4";
    }];
}, {
    readonly type: "function";
    readonly name: "proposeOwnerRotation";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "newOwner";
        readonly type: "address";
    }, {
        readonly name: "scheme";
        readonly type: "uint16";
    }, {
        readonly name: "pqSig";
        readonly type: "bytes";
    }, {
        readonly name: "pqPubkey";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "commitOwnerRotation";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "cancelOwnerRotation";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "proposePqPubkeyRotation";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "newPubkeyHash";
        readonly type: "bytes32";
    }, {
        readonly name: "scheme";
        readonly type: "uint16";
    }, {
        readonly name: "pqSigOld";
        readonly type: "bytes";
    }, {
        readonly name: "pqPubkeyOld";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "commitPqPubkeyRotation";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [];
    readonly outputs: readonly [];
}, {
    readonly type: "event";
    readonly name: "UserOpExecuted";
    readonly inputs: readonly [{
        readonly name: "sender";
        readonly type: "address";
        readonly indexed: true;
    }, {
        readonly name: "opHash";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "policyTag";
        readonly type: "uint8";
        readonly indexed: false;
    }, {
        readonly name: "verifierScheme";
        readonly type: "uint16";
        readonly indexed: false;
    }, {
        readonly name: "success";
        readonly type: "bool";
        readonly indexed: false;
    }];
}, {
    readonly type: "event";
    readonly name: "IntentExecuted";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "policyTag";
        readonly type: "uint8";
        readonly indexed: false;
    }, {
        readonly name: "opHash";
        readonly type: "bytes32";
        readonly indexed: false;
    }, {
        readonly name: "validator";
        readonly type: "address";
        readonly indexed: false;
    }];
}];
//# sourceMappingURL=nexoraAccount.d.ts.map