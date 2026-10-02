import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orderable: your menu, orderable by AI",
  description:
    "An open-source MCP server that lets any AI agent find your food, check what's fresh, and place a real order. For restaurants, cafes, bakeries and local delivery.",
  openGraph: {
    title: "Orderable",
    description: "Your menu. Now orderable by AI. Open-source MCP server for independent food businesses.",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
