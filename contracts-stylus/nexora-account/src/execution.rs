//! Execution path: `executeUserOp` validates then performs the call.

use alloc::vec::Vec;
use alloy_primitives::{Address, B256, U256};
use alloy_sol_types::sol;
use stylus_sdk::{call::RawCall, evm};

use crate::storage::Account;
use crate::validation::ValidationOutcome;
use nexora_shared::{compute_op_hash, UserOp};

sol! {
    event UserOpExecuted(
        address indexed sender,
        bytes32 indexed opHash,
        uint8 policyTag,
        uint16 verifierScheme,
        bool success
    );
    event IntentExecuted(
        bytes32 indexed agentId,
        uint8 policyTag,
        bytes32 opHash,
        address validator
    );
}

impl Account {
    /// Validate and execute a UserOp. Reverts on validation failure.
    pub fn do_execute_user_op(
        &mut self,
        op: UserOp,
        provided_pubkey: Vec<u8>,
    ) -> Result<bool, Vec<u8>> {
        let chain_id = U256::from(stylus_sdk::block::chainid());
        let self_addr = stylus_sdk::contract::address();
        if op.sender != self_addr {
            return Err(b"WRONG_SENDER".to_vec());
        }

        let op_hash: B256 = compute_op_hash(&op, chain_id, self_addr);

        // Validate against policy + signatures.
        let outcome = self.validate_op(
            op_hash,
            op.target,
            op.value,
            op.callData.as_ref(),
            op.signatures.as_ref(),
            op.validUntil,
            op.verifierScheme,
            &provided_pubkey,
        );

        if !outcome.is_ok() {
            return Err(format_outcome(outcome));
        }

        // Pick the nonce channel from policyTag: 0 = ecdsa-only, 1 = pq.
        let channel: u8 = match op.policyTag {
            0 => 0,
            _ => 1,
        };
        if let Err(e) = self.consume_nonce(channel, op.nonce) {
            return Err(e.as_bytes().to_vec());
        }

        // Forward call.
        let success = perform_call(op.target, op.value, op.callData.as_ref(), op.callGasLimit);

        evm::log(UserOpExecuted {
            sender: self_addr,
            opHash: op_hash,
            policyTag: op.policyTag,
            verifierScheme: op.verifierScheme,
            success,
        });
        Ok(success)
    }

    /// Wrapper that emits an additional `IntentExecuted` event tying the
    /// op to an `agentId` proposed off-chain.
    pub fn do_execute_intent(
        &mut self,
        agent_id: B256,
        op: UserOp,
        provided_pubkey: Vec<u8>,
    ) -> Result<bool, Vec<u8>> {
        let chain_id = U256::from(stylus_sdk::block::chainid());
        let self_addr = stylus_sdk::contract::address();
        let op_hash = compute_op_hash(&op, chain_id, self_addr);
        let policy_tag = op.policyTag;

        let success = self.do_execute_user_op(op, provided_pubkey)?;

        evm::log(IntentExecuted {
            agentId: agent_id,
            policyTag: policy_tag,
            opHash: op_hash,
            validator: self_addr,
        });
        Ok(success)
    }

    /// 4337-style simulator. Returns a packed validation status.
    /// 0 = ok, 1 = invalid signature, 2 = expired, 3 = policy denied.
    pub fn do_validate_user_op(
        &self,
        op: UserOp,
        op_hash: B256,
        provided_pubkey: Vec<u8>,
    ) -> u64 {
        let outcome = self.validate_op(
            op_hash,
            op.target,
            op.value,
            op.callData.as_ref(),
            op.signatures.as_ref(),
            op.validUntil,
            op.verifierScheme,
            &provided_pubkey,
        );
        match outcome {
            ValidationOutcome::Ok => 0,
            ValidationOutcome::Expired => 2,
            ValidationOutcome::PolicyDenied => 3,
            _ => 1,
        }
    }
}

fn perform_call(target: Address, value: U256, data: &[u8], _gas_limit: U256) -> bool {
    unsafe { RawCall::new_with_value(value).call(target, data) }.is_ok()
}

fn format_outcome(o: ValidationOutcome) -> Vec<u8> {
    // Use unique 4-byte tags so off-chain error decoders can distinguish
    // validation failure modes. The tags are ASCII for grep-ability:
    //
    //   IECD = invalid ECDSA, IPQs = invalid PQ sig, POLD = policy denied,
    //   PQRQ = PQ required, ECRQ = ECDSA required, SCHM = scheme mismatch,
    //   PKHM = pubkey hash mismatch, NUSD = nonce reused, EXPR = expired.
    match o {
        ValidationOutcome::Ok => b"OKOK".to_vec(),
        ValidationOutcome::InvalidEcdsa => b"IECD".to_vec(),
        ValidationOutcome::InvalidPq => b"IPQs".to_vec(),
        ValidationOutcome::PolicyDenied => b"POLD".to_vec(),
        ValidationOutcome::PqRequired => b"PQRQ".to_vec(),
        ValidationOutcome::EcdsaRequired => b"ECRQ".to_vec(),
        ValidationOutcome::SchemeMismatch => b"SCHM".to_vec(),
        ValidationOutcome::PubkeyMismatch => b"PKHM".to_vec(),
        ValidationOutcome::NonceUsed => b"NUSD".to_vec(),
        ValidationOutcome::Expired => b"EXPR".to_vec(),
    }
}
