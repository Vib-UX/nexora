# contracts-sol/

Pure Solidity **interface** declarations that match the Stylus contract ABIs.

These files are not deployed — they exist so that:

- Any Solidity dapp can import the canonical type signatures.
- The TS SDK (`wallet-sdk`) can generate viem ABIs from a single source of truth.
- Auditors can read the public surface without parsing Rust.

If you change a Stylus public method, mirror the change here.
