import SwRegister from '@/components/mobile/SwRegister'

export const metadata = {
  title: 'EMR Field App',
  description: 'EMR Global Field Engineer App',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
  themeColor: '#7D1D3F',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'EMR Field' },
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: '#F8F5F6', fontFamily: 'Poppins, sans-serif' }}>
      <SwRegister />
      {children}
    </div>
  )
}
