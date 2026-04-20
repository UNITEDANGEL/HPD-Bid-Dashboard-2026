import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  ...(process.env.NODE_ENV === "production" ? { distDir: "render_build" } : {}),
};

export default nextConfig;
