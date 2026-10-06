import { Footer, PageHeader } from "../../components";

export const metadata = {
  title: "EU AI Act record keeping: what to prepare",
  description: "A practical map of EU AI Act logging, oversight and evidence duties, with the limits of Orvessian’s current pilot made clear.",
  alternates: { canonical: "/insights/eu-ai-act-record-keeping" },
};

export default function EuAiActRecordKeeping() {
  return <main>
    <PageHeader label="Governance guide · reviewed 30 September 2026" title="EU AI Act record keeping: start with the decision trail.">
      <p>For teams preparing AI governance, the useful question is what can be reconstructed from an event, its context and the review that followed. The law applies differently by role and use case; this guide is a product-relevant reading map, not a compliance determination.</p>
    </PageHeader>
    <article className="foundation-content narrow seo-guide">
      <h2>What the Act asks for</h2>
      <p><a href="https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng#art_12">Article 12 of the EU AI Act</a> requires high-risk AI systems to technically allow automatic logging over their lifetime, at a level appropriate to their intended purpose. The logs must support traceability, post-market monitoring and operational monitoring. The detailed obligations depend on whether an organisation is a provider or deployer and on the system’s classification.</p>
      <p><a href="https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng#art_26">Article 26</a> addresses deployers of high-risk systems, including appropriate human oversight, monitoring and retention of automatically generated logs under their control. <a href="https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng#art_19">Article 19</a> addresses provider log retention. An evidence tool may help organise records, but it cannot decide classification, supply missing source events or satisfy every obligation on its own.</p>
      <h2>When the high-risk rules apply</h2>
      <p>The European Commission’s <a href="https://digital-strategy.ec.europa.eu/en/faqs/navigating-ai-act">current implementation guidance</a> says the high-risk rules for Annex III systems apply from 2 December 2027, and those for AI embedded in regulated physical products from 2 August 2028, following the AI Omnibus. Other AI Act provisions have different dates. Check the Commission’s timeline before relying on a deadline.</p>
      <h2>A practical evidence checklist</h2>
      <ol>
        <li><strong>Classify the system and your role.</strong> Record the intended use, who provides and deploys it, and which legal duties may apply.</li>
        <li><strong>Define the event.</strong> Identify the decision, time, system version, responsible actor and policy or approval context to capture.</li>
        <li><strong>Keep the source record.</strong> Retain required logs and documents in governed storage with access, retention and privacy controls.</li>
        <li><strong>Track the review.</strong> Show what a human checked, what was missing and which action followed.</li>
        <li><strong>Test the evidence path.</strong> Export a sample and confirm that an authorised reviewer can reconstruct the event and identify gaps.</li>
      </ol>
      <h2>Where Orvessian fits today</h2>
      <p>Orvessian’s private testnet pilot accepts selected structured governance records and connects them to recording-service signatures, private batch proofs and public Base Sepolia anchors. The synthetic demo shows the investigation workflow. These checks can help detect changes to disclosed records; they do not establish complete capture, source truth, correct decisions or legal compliance. Production availability remains in development.</p>
      <p>Explore the <a href="/product">governance workflow</a>, the <a href="/technology">verification boundaries</a> and the <a href="/status">dated readiness summary</a>.</p>
      <h2>Primary sources</h2>
      <ul>
        <li><a href="https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng">EU Artificial Intelligence Act, official text</a></li>
        <li><a href="https://digital-strategy.ec.europa.eu/en/faqs/navigating-ai-act">European Commission AI Act implementation FAQ</a></li>
      </ul>
    </article>
    <Footer />
  </main>;
}
