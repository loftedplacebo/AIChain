import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Common Ground | Useful AI work, made visible", description: "A simple way for people and AI agents to pay for useful work, prove it was done well, and build trust over time." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
