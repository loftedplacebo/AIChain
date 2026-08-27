import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { metadataBase: new URL("https://common-ground-ai-work.mjgrant.chatgpt.site"), title: "Orvessian | Autonomous agents. Human certainty.", description: "The trust and economic layer for autonomous work.", openGraph: { title: "Orvessian | Autonomous agents. Human certainty.", description: "The trust and economic layer for autonomous work.", images: [{ url: "/og.png", width: 1728, height: 941, alt: "Orvessian — Autonomous agents. Human certainty." }] }, twitter: { card: "summary_large_image", images: ["/og.png"] } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
