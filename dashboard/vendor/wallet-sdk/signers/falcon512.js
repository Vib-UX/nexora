/**
 * Real Falcon-512 signer.
 *
 * Two execution modes are supported:
 *
 *  1. **Browser wasm** (default in the dashboard) — the
 *     `signer/falcon-signer-wasm` crate compiled with `wasm-pack` runs
 *     keygen and sign in the visitor's browser. The dashboard injects a
 *     {@link Falcon512Adapter} that wraps the wasm bindings.
 *
 *  2. **Daemon HTTP** — the `signer/falcon-signer` Rust binary runs as a
 *     local process and exposes `GET /pubkey` + `POST /sign`. Used by
 *     Node-side callers (the agent, scripts) and as a browser fallback
 *     when wasm fails to load.
 *
 * Both modes converge on the same {@link Falcon512Signer} surface, which
 * the {@link NexoraClient} consumes.
 */
import { bytesToHex, hexToBytes, keccak256, toHex, } from "viem";
import { VerifierScheme } from "../types.js";
import { FALCON512_PUBKEY_BYTES as PK_LEN, FALCON512_SIG_BYTES as SIG_LEN, } from "./falconMock.js";
export const FALCON512_REAL_PUBKEY_BYTES = PK_LEN;
export const FALCON512_REAL_SIG_BYTES = SIG_LEN;
const DEFAULT_URL = "http://127.0.0.1:9090";
/**
 * Build a {@link Falcon512Signer} from an arbitrary adapter. The dashboard
 * passes a wasm-backed adapter; the daemon helpers below produce one
 * automatically.
 */
export async function makeFalcon512Signer(adapter) {
    const publicKey = await adapter.getPublicKey();
    if (publicKey.length !== PK_LEN) {
        throw new Error(`falcon512 adapter returned bad pubkey length: ${publicKey.length} (expected ${PK_LEN})`);
    }
    const pubkeyHashHex = keccak256(bytesToHex(publicKey));
    return {
        source: adapter.source,
        publicKey,
        async signOp(opHash) {
            const sigHex = await adapter.sign(opHash);
            const sigBytes = hexToBytes(sigHex);
            if (sigBytes.length !== SIG_LEN) {
                throw new Error(`falcon512 adapter returned bad sig length: ${sigBytes.length} (expected ${SIG_LEN})`);
            }
            return {
                scheme: VerifierScheme.Falcon512,
                pubkeyHash: pubkeyHashHex,
                sigBytes: bytesToHex(sigBytes),
            };
        },
    };
}
/**
 * Build a daemon-backed adapter. The daemon must already be serving
 * `/pubkey` and `/sign` (see `signer/falcon-signer/src/main.rs`).
 */
export function makeDaemonFalcon512Adapter(opts = {}) {
    const baseUrl = opts.signerUrl ?? DEFAULT_URL;
    const f = opts.fetchImpl ?? fetch;
    let cached = null;
    return {
        source: "daemon",
        async getPublicKey() {
            if (cached)
                return cached;
            const r = await f(`${baseUrl}/pubkey`);
            if (!r.ok) {
                throw new Error(`falcon-signer GET /pubkey failed: ${r.status}`);
            }
            const j = (await r.json());
            if (j.scheme !== VerifierScheme.Falcon512) {
                throw new Error(`unexpected scheme from signer: ${j.scheme}`);
            }
            const pk = hexToBytes(j.pubkey);
            if (pk.length !== PK_LEN) {
                throw new Error(`bad pubkey length from daemon: ${pk.length} (expected ${PK_LEN})`);
            }
            cached = pk;
            return pk;
        },
        async sign(opHash) {
            const r = await f(`${baseUrl}/sign`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ hash: opHash }),
            });
            if (!r.ok) {
                throw new Error(`falcon-signer POST /sign failed: ${r.status} ${await r.text()}`);
            }
            const j = (await r.json());
            if (j.error) {
                throw new Error(`falcon-signer error: ${j.error}`);
            }
            const expected = await this.getPublicKey();
            if (j.pubkey.toLowerCase() !== bytesToHex(expected).toLowerCase()) {
                throw new Error("falcon-signer pubkey mismatch — daemon serves a different keypair");
            }
            return j.sig;
        },
    };
}
/**
 * Convenience: ask the daemon for its current pubkey + return a
 * {@link Falcon512Keypair} compatible with older SDK call sites.
 */
export async function loadFalcon512Keypair(opts = {}) {
    const adapter = makeDaemonFalcon512Adapter(opts);
    const publicKey = await adapter.getPublicKey();
    return {
        publicKey,
        secretRef: opts.signerUrl ?? DEFAULT_URL,
    };
}
/**
 * Back-compat helper. Prefer {@link makeFalcon512Signer} +
 * {@link makeDaemonFalcon512Adapter} in new code.
 */
export async function signFalcon512(opHash, kp, opts = {}) {
    const baseUrl = opts.signerUrl ?? kp.secretRef ?? DEFAULT_URL;
    const adapter = makeDaemonFalcon512Adapter({
        ...opts,
        signerUrl: baseUrl,
    });
    // Trust the caller's pubkey rather than refetching from the daemon —
    // they already have it in the keypair.
    const signer = {
        source: adapter.source,
        publicKey: kp.publicKey,
        async signOp(h) {
            const sigHex = await adapter.sign(h);
            return {
                scheme: VerifierScheme.Falcon512,
                pubkeyHash: keccak256(bytesToHex(kp.publicKey)),
                sigBytes: sigHex,
            };
        },
    };
    return signer.signOp(opHash);
}
export function falcon512PubkeyCommitment(pk) {
    return keccak256(bytesToHex(pk));
}
export function serializeFalcon512Keypair(kp) {
    return JSON.stringify({
        publicKey: toHex(kp.publicKey),
        secretRef: kp.secretRef,
    });
}
export function deserializeFalcon512Keypair(s) {
    const o = JSON.parse(s);
    return {
        publicKey: hexToBytes(o.publicKey),
        secretRef: o.secretRef,
    };
}
//# sourceMappingURL=falcon512.js.map