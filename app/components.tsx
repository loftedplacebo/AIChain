export function Mark() { return <span className="mark" aria-hidden="true">◒</span>; }
const links = [["/products", "Products"], ["/product", "Trust layer"], ["/safety", "Safeguard"], ["/in-action", "Examples"], ["/technology", "Technology"], ["/developers", "Developers"], ["/vision", "Vision"]];
export function Nav({ dark = false }: { dark?: boolean }) {
  return <><a className="skip-link" href="#content">Skip to content</a><nav className={`nav ${dark ? "nav-dark" : ""}`} aria-label="Main navigation">
    <a className="brand" href="/"><Mark /> Orvessian</a>
    <div className="nav-links">{links.map(([href,title]) => <a key={href} href={href}>{title}</a>)}</div>
    <a className="nav-cta" href="/whitepaper">Whitepaper</a>
    <details className="mobile-menu"><summary>Menu</summary><div>{links.map(([href,title]) => <a key={href} href={href}>{title}</a>)}<a href="/status">Project status</a></div></details>
  </nav></>;
}
export function Footer() {
  return <footer><a className="brand" href="/"><Mark /> Orvessian</a><p>Trust infrastructure for autonomous systems.</p><div><a href="/products">Products</a><a href="/product">Trust layer</a><a href="/safety">Safeguard</a><a href="/developers">Developers</a><a href="/whitepaper">Whitepaper</a><a href="/status">Project status</a></div></footer>;
}
export function PageHeader({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return <section className="subhero tech-hero foundation-header"><Nav dark/><div className="subhero-copy" id="content"><p className="eyebrow">{label}</p><h1>{title}</h1><div className="header-description">{children}</div></div></section>;
}
export const repository = "https://github.com/loftedplacebo/AIChain";
