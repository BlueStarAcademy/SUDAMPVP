import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SUDAM - PVP Baduk",
  description: "Real-time Baduk game with PVP mode",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

