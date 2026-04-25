import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: true,
  output: 'standalone',
  serverExternalPackages: ['exceljs', 'better-sqlite3'],
  allowedDevOrigins: [
    '.space.chatglm.site',
    '.space.z.ai',
  ],
};

export default nextConfig;
