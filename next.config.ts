import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The extraction API route reads the fabricated vendor documents from disk
  // via fs.readFileSync, not via import — Next.js can't trace that
  // automatically when building the serverless function bundle, so the
  // files would be missing in production without this explicit include.
  // pdfjs-dist's worker file and font data are loaded at runtime via
  // require.resolve(), not a static import, so the tracer needs an explicit
  // nudge to bundle them too — same reason the vendor docs need this.
  outputFileTracingIncludes: {
    "/api/extract": ["./data/vendor-docs/**", "./node_modules/pdfjs-dist/legacy/build/**", "./node_modules/pdfjs-dist/standard_fonts/**"],
  },
};

export default nextConfig;
