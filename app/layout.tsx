import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import TrafficCurveEnhancer from "./TrafficCurveEnhancer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Food Truck Admin",
  description: "Schedule food-truck visits, manage vendor profiles, and make smarter lineup decisions.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TrafficCurveEnhancer />
        {children}
      </body>
    </html>
  );
}
