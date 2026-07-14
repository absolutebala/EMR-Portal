import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EMR Field App',
    short_name: 'EMR Field',
    description: 'EMR Global — Field Engineer Mobile App',
    start_url: '/mobile',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#7D1D3F',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
