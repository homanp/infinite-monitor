import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["just-bash", "bash-tool", "node-liblzma", "@mongodb-js/zstd", "dockerode", "esbuild"],
};

export default nextConfig;
