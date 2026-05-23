import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DevPulse Agent OS — Developer Command Center',
  description: 'Enterprise developer workflow intelligence: GitHub + Jira correlation, AI battle plans, real-time activity.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-[#f6f8fc] text-gray-900 antialiased font-sans min-h-screen">
        {children}
      </body>
    </html>
  )
}
