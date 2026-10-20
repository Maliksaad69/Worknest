import type { Metadata } from 'next';
import '../components/index.css';

export const metadata: Metadata = {
  title: 'Worknest — Client Project OS',
  description: 'Worknest Client Project OS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
