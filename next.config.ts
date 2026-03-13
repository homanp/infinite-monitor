import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["just-bash", "node-liblzma", "@mongodb-js/zstd"],
};

export default nextConfig;
