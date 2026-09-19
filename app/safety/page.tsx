import { Footer, PageHeader } from "../components";

export const metadata = { title: "Safeguard | Orvessian", description: "A clear record around the controls and interventions that matter in autonomous work.", openGraph: { images: [] }, twitter: { images: [] } };

const stages = [
  ["01", "Bind the policy", "Record the selected policy version, authority and execution context that applied to a meaningful action."],
  ["02", "Capture the signal", "Connect a selected tool request, monitor alert or enforcement result to the evidence retained by its custodian."],
  ["03", "Record the intervention", "Show who approved, paused, blocked or revoked access, with the scope of that decision."],
  ["04", "Review the timeline", "Give authorised reviewers a restricted, independently checkable record of what the surrounding controls observed."],
];

export default function Safety() {
  return <main><PageHeader label="Safeguard / product direction" title="Keep the controls around AI work clear."><p>When something needs to pause, block or escalate, the response should happen locally. The record should remain available afterwards.</p></PageHeader>
    <section className="safety-intro"><div><p className="eyebrow">The line between control and record</p><h2>Respond in the moment. Understand it later.</h2><p>AI systems need controls that can isolate, block, pause and revoke access. Orvessian does not take over those controls. It retains selected events and decisions they produce, so an authorised reviewer can understand an incident without relying only on the AI operator’s database.</p></div><div className="safety-boundary"><p>Your security controls</p><strong>Prevent and contain</strong><i>↓</i><p>Orvessian trust record</p><strong>Preserve and review</strong></div></section>
    <section className="safety-steps"><div className="paper-section-head"><p className="eyebrow">The intended safeguard flow</p><h2>Four selected events. One reviewable history.</h2></div><div>{stages.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
    <section className="foundation-content safety-product"><p className="eyebrow">Why independent anchoring matters</p><h2>Make a recorded commitment harder for one operator to quietly rewrite.</h2><p>A shared ledger can give reviewers evidence that does not depend solely on the operator’s own records. The strength of that property depends on the real network, key management, source systems and verification process. It does not make the agent, sandbox or application immune to AI-assisted attack.</p><a className="arrow-link" href="/technology">Read the technical boundaries <span>→</span></a></section>
    <section className="safety-nonclaim"><p className="eyebrow">The boundary matters</p><h2>A verification record cannot prevent an escape or prove an agent was safe.</h2><p>It cannot guarantee complete detection, ensure source events were truthful or replace a runtime security control. It can make selected observed events, policy bindings and authorised interventions easier to inspect with their stated scope.</p></section>
    <section className="foundation-content narrow"><p className="eyebrow">Availability</p><h2>Planned testnet work, not a live safety service.</h2><p>The agent-safety evidence profile and a generic policy-gateway example are next-phase development work. The current local receipt alpha does not offer real-time monitoring, automatic containment or a general safety verdict.</p><div className="actions"><a className="button primary" href="/developers">Explore the current developer alpha →</a><a className="arrow-link" href="/status">Inspect current status</a></div></section><Footer /></main>;
}
