import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import { Nav } from '@/components/nav';
import { Toaster } from '@/components/ui/sonner';
import { Providers } from '@/components/providers';
import './globals.css';

const nunito = Nunito({
  variable: '--font-nunito',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
});

export const metadata: Metadata = {
  title: 'Productivity Tracker',
  description: 'Team productivity tracking with realtime leaderboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${nunito.variable} antialiased font-[family-name:var(--font-nunito)]`}>
        <Providers>
          <Nav />
          <main className="container mx-auto px-4 py-8">
            {children}
          </main>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
