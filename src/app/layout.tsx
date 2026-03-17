import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://infinitemonitor.com"
  ),
  title: "Infinite Monitor",
  description: "An infinite dashboard, completely customizable by the user.",
  openGraph: {
    title: "Infinite Monitor",
    description: "An infinite dashboard, completely customizable by the user.",
    siteName: "Infinite Monitor",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Infinite Monitor",
    description: "An infinite dashboard, completely customizable by the user.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${GeistMono.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
