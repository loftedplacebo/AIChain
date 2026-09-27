import { Footer, Nav } from "../components";
import { ExplorerDashboard } from "./explorer-dashboard";

export const metadata = {
  title: "Base Sepolia Explorer | Orvessian",
  description: "Inspect Orvessian batch anchors and verify their Base Sepolia transaction receipts.",
  robots: { index: false, follow: false },
  openGraph: { images: [] },
  twitter: { images: [] }
};

export default function ExplorerPage() {
  return <main className="explorer-page"><Nav/><header className="explorer-page-header"><p className="eyebrow">Orvessian product alpha · Base Sepolia</p><h1>Independent records.<br/><em>Inspectable on-chain.</em></h1><p>A live, read-only view of testnet batch anchors and the public facts each one records.</p></header><ExplorerDashboard/><Footer/></main>;
}
