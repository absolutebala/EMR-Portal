import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  // Required for a minimal Docker image (AWS ECS deploy) — bundles a self-contained
  // server into .next/standalone instead of needing the full node_modules tree at runtime.
  output: 'standalone',
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
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
}

export default nextConfig
