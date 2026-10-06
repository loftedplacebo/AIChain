import type { Metadata } from "next";
import "./globals.css";
import "./platform-marketing.css";

export const siteUrl = "https://orvessian.mjgrant.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Orvessian | AI agent governance and verification", template: "%s | Orvessian" },
  description: "Understand recorded AI agent activity, investigate decisions and check the supporting evidence in one governance workspace.",
  applicationName: "Orvessian",
  openGraph: {
    type: "website",
    siteName: "Orvessian",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "Orvessian AI governance" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
