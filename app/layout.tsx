import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ThreadsByJoe", template: "%s · ThreadsByJoe" },
  description: "Joe writes your Threads posts and drafts replies to your comments. You approve, or switch on Auto.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
