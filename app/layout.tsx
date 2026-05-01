import type {Metadata} from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css'; // Global styles

const space= Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Pole Position Dash',
  description: 'Real-time F1 timing dashboard',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${space.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans bg-black text-white antialiased selection:bg-red-500/30" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
