import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.ORVESSIAN_NODE_BUILD === "1" ? "standalone" : undefined,
};

export default nextConfig;
