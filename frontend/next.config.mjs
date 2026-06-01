/** @type {import('next').NextConfig} */
const nextConfig = process.env.NEXT_OUTPUT === "export" ? { output: "export" } : {};

export default nextConfig;
