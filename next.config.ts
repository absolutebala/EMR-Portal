import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  // Build date (IST) captured at build time and inlined into the bundle, so the version
  // footer's date is automatic instead of a hand-maintained constant that drifts.
  env: {
    NEXT_PUBLIC_BUILD_DATE: new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10),
    // Unique per build — baked into the service worker (served from app/sw.js/route.ts)
    // so each deploy produces a different sw.js. That's what lets the browser detect a
    // new version, purge the old cache, and reload clients onto the current build
    // (otherwise a long-open PWA keeps calling the previous build's Server Actions —
    // the "Failed to find Server Action" error).
    NEXT_PUBLIC_BUILD_ID: process.env.BUILD_ID || String(Date.now()),
  },
  // Required for a minimal Docker image (AWS ECS deploy) — bundles a self-contained
  // server into .next/standalone instead of needing the full node_modules tree at runtime.
  output: 'standalone',
  // pdfkit reads its built-in AFM font metrics (Helvetica.afm, …) at runtime via a
  // dynamic __dirname-relative fs read. Bundling it breaks that path, and the standalone
  // tracer misses the .afm files — both cause "ENOENT … pdfkit/js/data/Helvetica.afm"
  // when generating report PDFs. Keep pdfkit a native require, and force-copy its font
  // data into the standalone output for every route.
  serverExternalPackages: ['pdfkit'],
  outputFileTracingIncludes: {
    '/**': ['./node_modules/pdfkit/js/data/**/*'],
  },
  // A stray package-lock.json in this machine's home directory (a parent of this repo)
  // makes Next.js misdetect the workspace root, which silently nests the standalone
  // output one directory deeper (.next/standalone/emr-portal/server.js instead of
  // .next/standalone/server.js) — breaks the Dockerfile's `CMD ["node", "server.js"]`
  // if it ever happens inside the actual build. Pinning the root explicitly fixes both
  // the nesting and the build-time warning.
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    // Mobile check-in/closure submit photos as base64 through Server Actions;
    // the 1MB default is too tight even after client-side compression.
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  // /sw.js is now served by app/sw.js/route.ts (so its content is versioned per build);
  // that route sets its own Content-Type / Cache-Control / Service-Worker-Allowed headers.
}

export default nextConfig
