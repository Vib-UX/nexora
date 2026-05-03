import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const walletSdkDist = path.resolve(__dirname, "../wallet-sdk/dist");
const viemPkg = path.resolve(__dirname, "node_modules/viem");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Resolve @nexora/wallet-sdk directly from the prebuilt dist/ in the
    // sibling workspace so Vercel can build the dashboard with a plain
    // `npm ci` (no workspace:* link, no tsc on Vercel).
    //
    // Pin viem to dashboard/node_modules so types match wagmi when the repo
    // root also has a different viem copy (local monorepo dev).
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@nexora/wallet-sdk/signers": path.join(walletSdkDist, "signers/index.js"),
      "@nexora/wallet-sdk": path.join(walletSdkDist, "index.js"),
      viem: viemPkg,
    };
    return config;
  },
};
export default nextConfig;
