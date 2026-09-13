import Link from "next/link";
export function Mark() { return <span className="mark" aria-hidden="true">◒</span>; }
const links = [["/product", "Product"], ["/in-action", "In action"], ["/technology", "Technology"], ["/developers", "Developers"], ["/vision", "Vision"]];
export function Nav({ dark = false }: { dark?: boolean }) {
  return <><a className="skip-link" href="#content">Skip to content</a><nav className={`nav ${dark ? "nav-dark" : ""}`} aria-label="Main navigation">
    <Link className="brand" href="/"><Mark /> Orvessian</Link>
    <div className="nav-links">{links.map(([href,title]) => <Link key={href} href={href}>{title}</Link>)}</div>
    <Link className="nav-cta" href="/whitepaper">Whitepaper</Link>
    <details className="mobile-menu"><summary>Menu</summary><div>{links.map(([href,title]) => <Link key={href} href={href}>{title}</Link>)}<Link href="/status">Project status</Link></div></details>
  </nav></>;
}
export function Footer() {
  return <footer><Link className="brand" href="/"><Mark /> Orvessian</Link><p>Autonomous agents. Human certainty.</p><div><Link href="/developers">Developers</Link><Link href="/whitepaper">Whitepaper</Link><Link href="/status">Project status</Link></div></footer>;
}
export function PageHeader({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return <section className="subhero tech-hero foundation-header"><Nav dark/><div className="subhero-copy" id="content"><p className="eyebrow">{label}</p><h1>{title}</h1><div className="header-description">{children}</div></div></section>;
}
export const repository = "https://github.com/loftedplacebo/AIChain";
