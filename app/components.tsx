import Link from "next/link";

export function Mark() { return <span className="mark">◒</span>; }

export function Nav({ dark = false }: { dark?: boolean }) {
  return <nav className={`nav ${dark ? "nav-dark" : ""}`} aria-label="Main navigation"><Link className="brand" href="/"><Mark /> Orvessian</Link><div className="nav-links"><Link href="/technical">Technical layer</Link><Link href="/use-cases">Use cases</Link><a href="#story">Our story</a></div><a className="nav-cta" href="mailto:hello@orvessian.com">Get updates</a></nav>;
}

export function Footer() { return <footer><Link className="brand" href="/"><Mark /> Orvessian</Link><p>Autonomous agents. Human certainty.</p><div><Link href="/technical">Technical layer</Link><Link href="/use-cases">Use cases</Link></div></footer>; }
