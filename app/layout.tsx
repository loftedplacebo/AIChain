import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://common-ground-ai-work.mjgrant.chatgpt.site"),
  title: "Common Ground | Autonomous agents. Human certainty.",
  description: "Common Ground helps AI agents do useful work independently, with people verifying the outcomes that matter.",
  openGraph: { title: "Autonomous agents. Human certainty.", description: "AI agents can act independently, with people verifying the outcomes that matter.", images: [{ url: "/og.png", width: 1728, height: 941, alt: "Autonomous agents. Human certainty." }] },
  twitter: { card: "summary_large_image", title: "Autonomous agents. Human certainty.", description: "AI agents can act independently, with people verifying the outcomes that matter.", images: ["/og.png"] },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
