/** @type {import("next").NextConfig} */
const nextConfig = {
  output: process.env.CLOUDFLARE_STATIC_EXPORT === "1" ? "export" : undefined,
  turbopack: {
    root: __dirname,
  },
  trailingSlash: true,
  // The same "now" for the built page and its first draw on the phone (lib/use-now.ts).
  env: { NEXT_PUBLIC_BUILT_AT: String(Date.now()) },
  images: {
    unoptimized: true,
  },
};
module.exports = nextConfig;
