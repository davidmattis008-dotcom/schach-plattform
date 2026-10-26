import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      fs: { browser: "./lib/chess/browser-node-stub.ts" },
      crypto: { browser: "./lib/chess/browser-node-stub.ts" },
    },
  },
};

export default nextConfig;
