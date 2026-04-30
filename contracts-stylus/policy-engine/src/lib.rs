//! `PolicyEngine` — classifies a candidate operation into one of:
//!
//! - `LOW` (0) — ECDSA only
//! - `HIGH` (1) — ECDSA + PQ
//! - `CRITICAL` (2) — PQ + timelock
//!
//! Wallets ask the engine for a `Tag` *before* they validate signatures so
//! the validator router knows which signatures are required. The engine uses
//! a transparent rule-table:
//!
//! ```text
//! 1. value > critical_threshold        → CRITICAL
//! 2. target ∈ critical_targets         → CRITICAL
//! 3. value > high_threshold            → HIGH
//! 4. target ∈ high_targets             → HIGH
//! 5. selector ∈ high_selectors (4-byte)→ HIGH
//! 6. otherwise                          → LOW
//! ```
//!
//! Owner can extend each set at runtime. Selectors come from `callData`'s
//! first 4 bytes (Solidity-style); for raw value transfers callData is
//! empty and we skip the selector check.

#![cfg_attr(not(feature = "export-abi"), no_main)]

extern crate alloc;

use alloc::vec::Vec;
use alloy_primitives::{Address, FixedBytes, U256};
use stylus_sdk::{abi::Bytes, prelude::*};

pub const TAG_LOW: u8 = 0;
pub const TAG_HIGH: u8 = 1;
pub const TAG_CRITICAL: u8 = 2;

sol_storage! {
    #[entrypoint]
    pub struct PolicyEngine {
        address owner;
        bool initialized;
        /// `value > high_threshold` → HIGH
        uint256 high_threshold;
        /// `value > critical_threshold` → CRITICAL (overrides HIGH)
        uint256 critical_threshold;
        /// targets that always escalate to HIGH
        mapping(address => bool) high_targets;
        /// targets that always escalate to CRITICAL
        mapping(address => bool) critical_targets;
        /// 4-byte selectors that always escalate to HIGH
        mapping(bytes4 => bool) high_selectors;
        /// 4-byte selectors that always escalate to CRITICAL
        mapping(bytes4 => bool) critical_selectors;
    }
}

#[public]
impl PolicyEngine {
    /// One-shot init. Sane defaults:
    /// - high_threshold     =   1 ether
    /// - critical_threshold = 100 ether
    pub fn init(&mut self, owner: Address) -> Result<(), Vec<u8>> {
        if self.initialized.get() {
            return Err(b"ALREADY_INIT".to_vec());
        }
        self.owner.set(owner);
        self.high_threshold.set(U256::from(1_000_000_000_000_000_000u128));
        self.critical_threshold
            .set(U256::from(100_000_000_000_000_000_000u128));
        self.initialized.set(true);
        Ok(())
    }

    /// Classify an op without storage mutation.
    pub fn classify(
        &self,
        _account: Address,
        target: Address,
        value: U256,
        call_data: Bytes,
    ) -> u8 {
        if value > self.critical_threshold.get() {
            return TAG_CRITICAL;
        }
        if self.critical_targets.get(target) {
            return TAG_CRITICAL;
        }
        if call_data.len() >= 4 {
            let sel = FixedBytes::<4>::from_slice(&call_data[..4]);
            if self.critical_selectors.get(sel) {
                return TAG_CRITICAL;
            }
        }
        if value > self.high_threshold.get() {
            return TAG_HIGH;
        }
        if self.high_targets.get(target) {
            return TAG_HIGH;
        }
        if call_data.len() >= 4 {
            let sel = FixedBytes::<4>::from_slice(&call_data[..4]);
            if self.high_selectors.get(sel) {
                return TAG_HIGH;
            }
        }
        TAG_LOW
    }

    // ---- Owner-gated configuration --------------------------------------

    pub fn set_thresholds(&mut self, high: U256, critical: U256) -> Result<(), Vec<u8>> {
        self.assert_owner()?;
        self.high_threshold.set(high);
        self.critical_threshold.set(critical);
        Ok(())
    }

    pub fn set_high_target(&mut self, target: Address, on: bool) -> Result<(), Vec<u8>> {
        self.assert_owner()?;
        self.high_targets.setter(target).set(on);
        Ok(())
    }

    pub fn set_critical_target(&mut self, target: Address, on: bool) -> Result<(), Vec<u8>> {
        self.assert_owner()?;
        self.critical_targets.setter(target).set(on);
        Ok(())
    }

    pub fn set_high_selector(
        &mut self,
        selector: FixedBytes<4>,
        on: bool,
    ) -> Result<(), Vec<u8>> {
        self.assert_owner()?;
        self.high_selectors.setter(selector).set(on);
        Ok(())
    }

    pub fn set_critical_selector(
        &mut self,
        selector: FixedBytes<4>,
        on: bool,
    ) -> Result<(), Vec<u8>> {
        self.assert_owner()?;
        self.critical_selectors.setter(selector).set(on);
        Ok(())
    }

    pub fn owner(&self) -> Address {
        self.owner.get()
    }
}

impl PolicyEngine {
    fn assert_owner(&self) -> Result<(), Vec<u8>> {
        if stylus_sdk::msg::sender() != self.owner.get() {
            return Err(b"NOT_OWNER".to_vec());
        }
        Ok(())
    }
}
