import Link from "next/link";

export function Mark() { return <span className="mark" aria-hidden="true">◒</span>; }
const links = [["/product", "Platform"], ["/products/governance-preview", "Plans"], ["/in-action", "Use cases"], ["/technology", "Verification"], ["/developers", "Developers"]];
export function Nav({ dark = false }: { dark?: boolean }) {
  return <><a className="skip-link" href="#content">Skip to content</a><nav className={`nav ${dark ? "nav-dark" : ""}`} aria-label="Main navigation">
    <Link className="brand" href="/"><Mark /> Orvessian</Link>
    <div className="nav-links">{links.map(([href,title]) => <a key={href} href={href}>{title}</a>)}</div>
    <a className="nav-cta" href="/portal">Explore demo</a>
    <details className="mobile-menu"><summary>Menu</summary><div>{links.map(([href,title]) => <a key={href} href={href}>{title}</a>)}<a href="/portal">Explore demo</a><a href="/workspace">Workspace sign in</a><a href="/status">Project status</a></div></details>
  </nav></>;
}
export function Footer() {
  return <footer><Link className="brand" href="/"><Mark /> Orvessian</Link><p>AI governance backed by independently checkable evidence.</p><div><a href="/product">Platform</a><a href="/products/governance-preview">Plans</a><a href="/workspace">Workspace sign in</a><a href="/explorer">Testnet explorer</a><a href="/safety">Safety boundaries</a><a href="/developers">Developers</a><a href="/whitepaper">Whitepaper</a><a href="/status">Project status</a></div></footer>;
}
export function PageHeader({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return <section className="subhero tech-hero foundation-header"><Nav dark/><div className="subhero-copy" id="content"><p className="eyebrow">{label}</p><h1>{title}</h1><div className="header-description">{children}</div></div></section>;
}
export const repository = "https://github.com/loftedplacebo/AIChain";
