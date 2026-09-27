import type { Metadata } from "next";
import "./globals.css";
import "./platform-marketing.css";
export const metadata: Metadata = { metadataBase: new URL("https://orvessian.mjgrant.chatgpt.site"), title: "Orvessian | AI governance and verification", description: "A governance workspace for AI activity, outcomes and independently checkable evidence.", openGraph: { title: "Orvessian | AI governance and verification", description: "A governance workspace for AI activity, outcomes and independently checkable evidence.", images: [] }, twitter: { card: "summary", images: [] } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
