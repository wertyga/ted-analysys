import type { Metadata } from 'next';
import 'antd/dist/reset.css';
import './styles.css';

export const metadata: Metadata = {
  title: 'TED Admin',
  description: 'Administration panel for TED Tender Search',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
