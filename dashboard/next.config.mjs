import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const walletSdkDist = path.resolve(__dirname, "../wallet-sdk/dist");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Resolve @nexora/wallet-sdk directly from the prebuilt dist/ in the
    // sibling workspace so Vercel can build the dashboard with a plain
    // `pnpm install` (no workspace:* link, no tsc on Vercel).
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@nexora/wallet-sdk/signers": path.join(walletSdkDist, "signers/index.js"),
      "@nexora/wallet-sdk": path.join(walletSdkDist, "index.js"),
    };
    return config;
  },
};
export default nextConfig;
