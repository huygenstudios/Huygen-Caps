/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  ...(process.env.NEXT_OUTPUT === "export" ? { output: "export" } : {}),
  eslint: {
    ignoreDuringBuilds: process.env.SKIP_BUILD_VALIDATION === "true",
  },
  typescript: {
    ignoreBuildErrors: process.env.SKIP_BUILD_VALIDATION === "true",
  },
};

export default nextConfig;
