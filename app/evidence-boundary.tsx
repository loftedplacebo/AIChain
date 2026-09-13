
export function EvidenceBoundary() {
  return <section className="foundation-content" id="evidence-boundary" aria-labelledby="boundary-title">
    <p className="eyebrow">Private work. Shared confidence.</p>
    <h2 id="boundary-title">Show what matters.<br/>Keep the rest private.</h2>
    <p className="boundary-intro">In this proposed workflow, the organisation keeps the source material. A reviewer receives selected evidence. The shared anchor records a commitment—not a public copy of the job.</p>
    <div className="boundary-grid">
      <article><span className="stage-label">01 / Inside the organisation</span><h3>The working evidence</h3><ul><li>Supplier documents and commercial terms</li><li>Internal policies and the agent’s brief</li><li>Detailed activity and review notes</li></ul><p>The custodian manages access, retention and recovery.</p></article>
      <article><span className="stage-label">02 / Disclosed to a reviewer</span><h3>A focused review package</h3><ul><li>The exact document version being checked</li><li>The relevant decision and its signer</li><li>What is needed to match the evidence to its record</li></ul><p>Disclosure is an access-controlled copy of selected evidence, not unrestricted access to the vault.</p></article>
      <article><span className="stage-label">03 / Shared anchor</span><h3>A checkable reference</h3><ul><li>A receipt commitment or batch root</li><li>The transaction and inclusion reference</li><li>Public chain metadata, not the source documents</li></ul><p>A commitment binds to recorded data. It does not reveal or recover that data by itself.</p></article>
    </div>
    <p className="boundary-caveat">Privacy is not automatic: transaction metadata may be visible, and recipients can retain disclosed material. Evidence protection, careful commitments and retention policies still matter.</p>
    <a className="arrow-link" href="/technology">Understand the verification boundaries →</a>
  </section>;
}
