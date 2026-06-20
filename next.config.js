/** @type {import("next").NextConfig} */
const nextConfig = {
  output: process.env.CLOUDFLARE_STATIC_EXPORT === "1" ? "export" : undefined,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};
module.exports = nextConfig;
