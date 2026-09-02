import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
      };
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      "isomorphic-ws": new URL("./lib/isomorphic-ws-fix.mjs", import.meta.url)
        .pathname,
      "@contract": require("path").resolve(
        process.cwd(),
        "midnight-allowlist/contracts/managed/zk-allowlist",
      ),
    };
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      topLevelAwait: true,
    };
    return config;
  },
};

export default nextConfig;
