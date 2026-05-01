import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ContextAnchor — AI Hallucination Prevention",
  description:
    "Prevent AI hallucinations with intelligent context tracking. Auto-summarize conversations, detect contradictions, and keep your AI grounded.",
  keywords: [
    "AI",
    "hallucination",
    "context",
    "prompt engineering",
    "ChatGPT",
    "Claude",
  ],
  openGraph: {
    title: "ContextAnchor ⚓ — AI Hallucination Prevention",
    description:
      "Keep your AI conversations grounded with real-time context anchoring.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
