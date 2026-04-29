import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Nexora — Post-Quantum Smart Wallet",
  description:
    "Hybrid ECDSA + post-quantum smart wallet on Arbitrum Orbit (Stylus).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-nexora-bg text-zinc-100">
        <Providers>
          <div className="mx-auto max-w-5xl px-6 py-8">
            <header className="flex items-center justify-between border-b border-nexora-border pb-4">
              <h1 className="text-xl font-semibold tracking-tight">
                Nexora <span className="text-nexora-accent">·</span>{" "}
                <span className="text-zinc-400">post-quantum smart wallet</span>
              </h1>
              <a
                className="text-xs text-zinc-500 hover:text-zinc-200"
                href="https://github.com/"
                target="_blank"
                rel="noreferrer"
              >
                docs ↗
              </a>
            </header>
            <main className="pt-6">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
