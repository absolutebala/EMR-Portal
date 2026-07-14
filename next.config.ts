import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
