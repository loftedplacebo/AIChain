import { Footer, Nav } from "./components";
import { LivingReceipt } from "./living-receipt";

const layers = [
  ["01", "Govern", "Set the mandate, limits and people responsible for an action."],
  ["02", "Safeguard", "Keep controls local. Record the alerts, pauses and interventions that matter."],
  ["03", "Account", "Preserve a reviewable history that is not trapped in one operator’s database."],
];

const examples = [
  ["Purchasing agent", "It can place routine orders.", "When a limit is exceeded, the exception is paused and the manager’s decision is retained."],
  ["Support agent", "It resolves ordinary cases.", "When a refund or sensitive request needs approval, the authority and review are clear."],
  ["Warehouse robot", "It completes an assigned task.", "If a control triggers, the alert and response are available for later inspection."],
];

export default function Home() {
  return <main>
    <section className="cinematic-hero"><Nav dark /><div className="cinematic-layout"><div className="cinematic-copy" id="content"><p className="eyebrow">Trust infrastructure for autonomous systems</p><h1>Autonomy needs<br />a <em>trusted record.</em></h1><p className="cinematic-lede">When AI takes action, organisations need to know what it was allowed to do, what happened, and what people did when something changed.</p><div className="actions"><a className="button primary" href="/product">Explore the trust layer <span>→</span></a><a className="button cinematic-secondary" href="/in-action#examples">See simple examples <span>→</span></a></div><p className="hero-readiness">Local receipt tooling in alpha. The broader trust layer is in development.</p></div><LivingReceipt /></div><div className="hero-bottom-line"><span>AUTHORITY · CONTROLS · ACCOUNTABILITY</span><a href="#why-it-matters">Why the record matters ↓</a></div></section>
    <section className="intro" id="why-it-matters"><p className="eyebrow">AI is moving from answers to actions.</p><h2>When work is delegated, trust should not <em>disappear.</em></h2><p className="section-copy">An autonomous system may cross tools, teams and organisations in seconds. The real question is no longer only whether it produced a good answer. It is whether the work was governed, the controls responded, and the outcome can be explained.</p></section>
    <section className="trust-model"><div><p className="eyebrow">The trust layer</p><h2>Three simple jobs.<br /><em>One shared history.</em></h2><p>Orvessian sits alongside the systems that act and enforce. It gives authorised people a clearer account of the authority, control events and decisions around consequential autonomous work.</p></div><div className="trust-model-list">{layers.map(([number, title, copy]) => <article key={title}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
    <section className="example-section" id="examples"><div className="paper-section-head"><p className="eyebrow">What this looks like</p><h2>Useful work. Clear boundaries. A record people can revisit.</h2></div><div className="example-grid">{examples.map(([title, action, outcome]) => <article key={title}><p className="example-label">Illustrative example</p><h3>{title}</h3><strong>{action}</strong><p>{outcome}</p></article>)}</div><a className="arrow-link" href="/in-action#examples">Explore the examples in more detail <span>→</span></a></section>
    <section className="foundation-band"><div><p className="eyebrow">An independent record</p><h2>Not another dashboard.<br />A record people can stand behind.</h2></div><div><p>Orvessian is being built as an impartial record around autonomous work. The runtime still enforces permissions. Safety controls still make immediate decisions. People still decide what the evidence means.</p><p>The trust layer retains selected events and decisions so the history is easier to inspect, share and challenge later.</p><a className="button primary" href="/safety">Understand the safety boundary →</a></div></section>
    <section className="foundation-content narrow"><p className="eyebrow">Under the hood</p><h2>The technology should support the story—not replace it.</h2><p>Receipts, signatures, private evidence and chain anchors are the tools behind a reviewable record. They each have a specific purpose and limit. Technical readers can inspect the alpha, the architecture and the whitepaper directly.</p><div className="actions"><a className="button primary" href="/technology">How it works →</a><a className="arrow-link" href="/whitepaper">Read the working paper</a></div></section><Footer />
  </main>;
}
