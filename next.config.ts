import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["just-bash", "bash-tool", "node-liblzma", "@mongodb-js/zstd", "dockerode"],
};

export default nextConfig;
