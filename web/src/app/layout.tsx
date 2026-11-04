import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TapFlow", template: "%s · TapFlow" },
  description: "Scan, order and pay from your seat.",
  applicationName: "TapFlow",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111827",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}
