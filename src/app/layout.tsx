import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  applicationName: "Interview Prep Hub",
  title: {
    default: "Interview Prep Hub",
    template: "%s | Interview Prep Hub",
  },
  description: "Content-driven interview question bank for focused preparation.",
  openGraph: {
    title: "Interview Prep Hub",
    description: "Content-driven interview question bank for focused preparation.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  initialScale: 1,
  width: "device-width",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={geist.variable}>
      <body>{children}</body>
    </html>
  );
}
