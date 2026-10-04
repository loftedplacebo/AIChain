import { Footer, PageHeader } from "../components";

export const metadata = {
  title: "Platform status | Orvessian",
  description: "Dated status of the synthetic pilot, evidence path and release gates.",
  openGraph: { images: [] },
  twitter: { images: [] },
};

export default function Status() {
  return <main>
    <PageHeader label="Platform status · 4 October 2026" title="Progress with the limits attached.">
      <p>This is a dated product and deployment snapshot, not a live availability monitor or a production service promise. The public demonstration uses synthetic data. Access to the hosted pilot requires approval.</p>
    </PageHeader>
    <section className="foundation-content">
      <div className="foundation-grid">
        <article>
          <span className="stage-label">Hosted synthetic pilot</span>
          <h2>Portal and API</h2>
          <p>The operator-only pilot portal and API run over HTTPS with WorkOS sign-in, required authenticator MFA and a managed PostgreSQL database. One scoped-key synthetic submission was accepted and appeared in the workspace. New visitors can request access; approval remains manual.</p>
        </article>
        <article>
          <span className="stage-label">Separate testnet demonstration</span>
          <h2>Signed evidence and Base</h2>
          <p>The supervised demonstration has produced signed receipts, private batch proofs and checked Base Sepolia transactions. The new hosted managed-database record has not yet passed that worker and independent export-verification path.</p>
        </article>
        <article>
          <span className="stage-label">Pilot operations</span>
          <h2>Encrypted recovery</h2>
          <p>Daily encrypted PostgreSQL backups upload to a separate Backblaze B2 account. An authenticated B2 download restored into a new closed database in the existing managed cluster. A lost-cluster rebuild and service activation remain untested.</p>
        </article>
      </div>
      <div className="status-update">
        <span>Before a first design-partner credential</span>
        <h2>Complete the hosted evidence and access checks.</h2>
        <p>Next checks are a signed hosted receipt and independently verified export, a complete non-operator approval and MFA journey, key revocation, and named application monitoring and support. The first trial will be limited to agreed synthetic records.</p>
      </div>
      <div className="status-update">
        <span>Later release work</span>
        <h2>Production access and paid plans remain gated.</h2>
        <p>Full recovery from a lost database cluster, production security and data terms, broader integrations, configurable alerts, billing and service commitments need separate acceptance. Website plans and prices are proposals, not an available paid service.</p>
      </div>
      <div className="reading-list">
        <h2>Explore the platform.</h2>
        <a href="/portal">Synthetic governance demonstration <span>Illustrative data →</span></a>
        <a href="https://portal.orvessian.com/workspace">Sign in or request pilot access <span>Approval required →</span></a>
        <a href="/technical">Architecture and assurance <span>What each check establishes →</span></a>
        <a href="/developers">Developer tooling <span>Start with the local example →</span></a>
      </div>
      <aside className="notice">
        <strong>What is not being claimed</strong>
        <p>No production service, proven customer adoption, universal AI correctness, live safety controller or complete capture. Recorded activity is not an automatic inventory. A signed record does not authenticate its original model or establish Ethereum finality.</p>
      </aside>
    </section>
    <Footer />
  </main>;
}
