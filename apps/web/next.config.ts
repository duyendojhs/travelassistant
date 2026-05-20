import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  typedRoutes: true,
  transpilePackages: ["@travelassistant/shared"]
};

export default nextConfig;
