// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPolicyEngine
/// @notice Classifies UserOps into LOW (0), HIGH (1), CRITICAL (2).
interface IPolicyEngine {
    function classify(
        address account,
        address target,
        uint256 value,
        bytes calldata data
    ) external view returns (uint8 tag);

    function set_thresholds(uint256 high, uint256 critical) external;
    function set_high_target(address target, bool on) external;
    function set_critical_target(address target, bool on) external;
    function set_high_selector(bytes4 selector, bool on) external;
    function set_critical_selector(bytes4 selector, bool on) external;
    function owner() external view returns (address);
}
