import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The extraction API route reads the fabricated vendor documents from disk
  // via fs.readFileSync, not via import — Next.js can't trace that
  // automatically when building the serverless function bundle, so the
  // files would be missing in production without this explicit include.
  outputFileTracingIncludes: {
    "/api/extract": ["./data/vendor-docs/**"],
  },
};

export default nextConfig;
