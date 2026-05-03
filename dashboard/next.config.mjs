import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viemPkg = path.resolve(__dirname, "node_modules/viem");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@nexora/wallet-sdk"],
  webpack: (config) => {
    // Pin viem to dashboard/node_modules so types match wagmi when the repo
    // root also has a different viem copy (local monorepo dev).
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      viem: viemPkg,
    };
    return config;
  },
};
export default nextConfig;
