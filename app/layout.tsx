import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance App",
  description: "Mobile-first Finanztracking mit Kategorien, Konten und Budget-Bars.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Finance"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f1e8"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
