# dashboard

Next.js + wagmi UI for Nexora. Reads `deployments.json` written by
`scripts/deploy-all.ts` (via `NEXT_PUBLIC_DEPLOYMENTS` env var).

```bash
NEXT_PUBLIC_DEPLOYMENTS=$(cat ../deployments.json) pnpm dev
```

Pages:

- `/` — connect wallet, account predict-address, send/classify form, op history
- (planned) `/agent` — live feed of `IntentExecuted` events from the demo agent
