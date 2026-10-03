import type { NextConfig } from "next";

// Security headers on every response. The microphone is allowed for this site only (Ask by voice).
// A Content-Security-Policy is a follow-up: a strict one needs care with the map tiles, workers and voice.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // The live grader reads PDFs on the server with pdf.js, and its two sample policies ship with the function.
  serverExternalPackages: ["pdfjs-dist"],
  outputFileTracingIncludes: { "/api/grade": ["./data/grade-samples/*.pdf"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
