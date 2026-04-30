# Falcon-core fuzz harness

Two libFuzzer targets covering `nexora_falcon_core::verify`:

- `verify_random_inputs` — feeds arbitrary bytes as `(msg_hash, sig, pubkey)`
  and asserts `verify` never panics; only returns `bool`.
- `verify_perturbed_sig` — fixes a seed + message, signs once, then XORs
  fuzzer-supplied perturbations over the signature body and asserts perturbed
  signatures don't accidentally verify.

## Run

```bash
cargo install cargo-fuzz             # one-time
cd contracts-stylus/falcon-core/fuzz
cargo +nightly fuzz run verify_random_inputs       # 5–60s smoke
cargo +nightly fuzz run verify_perturbed_sig -- -runs=200000
```

Corpus / artifact files land in
`contracts-stylus/falcon-core/fuzz/{corpus,artifacts}` and are gitignored.
