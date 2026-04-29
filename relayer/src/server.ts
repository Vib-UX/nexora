import "dotenv/config";
import Fastify from "fastify";
import type { Hex } from "viem";
import { Executor } from "./executor.js";
import type {
  ErrorResponse,
  RelayedOpRequest,
  RelayedOpResponse,
} from "./types.js";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

const PORT = Number(process.env.PORT ?? 8787);
const RPC_URL = process.env.NEXORA_RPC_URL ?? "http://localhost:8547";
const PRIVATE_KEY = need("RELAYER_PRIVATE_KEY") as Hex;

const executor = new Executor({ rpcUrl: RPC_URL, privateKey: PRIVATE_KEY });

const fastify = Fastify({ logger: { level: "info" } });

fastify.get("/health", async () => ({
  ok: true,
  relayer: executor.account.address,
  rpc: RPC_URL,
}));

fastify.post("/op", async (req, reply) => {
  const body = req.body as RelayedOpRequest;
  if (!body || !body.op || !body.providedPubkey) {
    return reply.code(400).send({ error: "BAD_BODY" } as ErrorResponse);
  }
  try {
    const { txHash, account } = await executor.run(body);
    const out: RelayedOpResponse = {
      txHash,
      account,
      policyTag: body.op.policyTag,
    };
    return out;
  } catch (err) {
    fastify.log.error(err);
    return reply.code(500).send({
      error: "EXEC_FAILED",
      detail: (err as Error).message,
    } as ErrorResponse);
  }
});

fastify.listen({ port: PORT, host: "0.0.0.0" }).then((addr) => {
  fastify.log.info(`nexora relayer listening at ${addr}`);
});
