import { Footer, PageHeader } from "../components";

const layers = [
  ["Govern", "Start with a clear mandate.", "Define who can act, what they can do and where a person must remain responsible. Orvessian records selected authority and policy context; the application still enforces it."],
  ["Safeguard", "Keep the response close to the action.", "Your gateway, sandbox or monitor should allow, pause, block or revoke access in real time. Orvessian records selected signals and interventions for later review."],
  ["Account", "Keep the story when the work is over.", "Link the action, evidence and decision into a durable history that authorised reviewers can inspect without relying only on one operator’s logs."],
];

export const metadata = { title: "Trust layer | Orvessian", description: "Independent trust infrastructure for autonomous systems.", openGraph: { images: [] }, twitter: { images: [] } };

export default function Product() {
  return <main><PageHeader label="The trust layer" title="A shared history for autonomous work."><p>Orvessian helps organisations govern, safeguard and account for consequential AI actions—without pretending one record can do every job.</p></PageHeader>
    <section className="foundation-content narrow"><p className="eyebrow">Where it fits</p><h2>Your systems act.<br />Your controls respond.<br /><em>Orvessian keeps the record.</em></h2><p>It is an independent layer around the work, not a replacement for an agent runtime, policy gateway or human judgement. Its purpose is to make the important context easier to inspect after an action, exception or incident.</p></section>
    <section className="trust-layer-detail">{layers.map(([title, heading, copy], index) => <article key={title}><span>0{index + 1}</span><div><p className="eyebrow">{title}</p><h2>{heading}</h2><p>{copy}</p></div></article>)}</section>
    <section className="example-section"><div className="paper-section-head"><p className="eyebrow">A simple example</p><h2>An agent can move quickly. The organisation can still stay accountable.</h2></div><div className="example-grid"><article><p className="example-label">Before</p><h3>Set the limit</h3><p>A purchasing agent may research suppliers and place routine orders within an approved spend limit.</p></article><article><p className="example-label">During</p><h3>Handle the exception</h3><p>An order exceeds the limit. The application pauses it and alerts the appropriate manager.</p></article><article><p className="example-label">After</p><h3>Explain the decision</h3><p>The authority, exception and manager’s decision remain connected for an authorised review.</p></article></div></section>
    <section className="foundation-band"><div><p className="eyebrow">The independent record</p><h2>More than an activity log.</h2></div><div><p>Ordinary logs are useful, but often live inside the system that produced them. Orvessian is intended to give selected records an independent, shared reference point.</p><p>That does not prove every source event was true or every decision was right. It makes the scope of the record and its checks easier to see.</p><a className="button primary" href="/in-action">See the examples →</a></div></section><Footer /></main>;
}
