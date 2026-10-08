import { Footer, PageHeader } from "../components";

export const metadata = {
  title: "Platform status | Orvessian",
  description: "Dated status of the synthetic pilot, evidence path and release gates.",
  alternates: { canonical: "/status" },
};

export default function Status() {
  return <main>
    <PageHeader label="Platform status · 8 October 2026" title="Progress with the limits attached.">
      <p>This is a dated product and deployment snapshot, not a live availability monitor or a production service promise. The public demonstration uses synthetic data. Verified users can sign up for the bounded hosted test pilot.</p>
    </PageHeader>
    <section className="foundation-content">
      <div className="foundation-grid">
        <article>
          <span className="stage-label">Hosted synthetic pilot</span>
          <h2>Portal and API</h2>
          <p>The pilot portal and API run over HTTPS with WorkOS sign-in, required email verification and authenticator MFA, and a managed PostgreSQL database. Sign-up is open for synthetic testing, with a five-project limit and automatic per-project evidence workers. Three internal projects are currently provisioned; a fresh-account onboarding check remains open.</p>
        </article>
        <article>
          <span className="stage-label">Separate testnet demonstration</span>
          <h2>Signed evidence and Base</h2>
          <p>The hosted pilot has produced signed receipts, private batch proofs and checked Base Sepolia transactions. A new internal project's receipt passed independent signer, record-commitment, batch-membership and chain-inclusion checks.</p>
        </article>
        <article>
          <span className="stage-label">Pilot operations</span>
          <h2>Encrypted recovery</h2>
          <p>Daily encrypted PostgreSQL backups upload to a separate Backblaze B2 account. An authenticated B2 download restored into a new closed database in the existing managed cluster. A lost-cluster rebuild and service activation remain untested.</p>
        </article>
      </div>
      <div className="status-update">
        <span>Before a first design-partner credential</span>
        <h2>Complete fresh-account and partner checks.</h2>
        <p>Next checks are a new account's email verification, MFA and first project journey, retirement of its test key, and a separate partner-owned synthetic trial. The first partner trial will be limited to agreed synthetic records.</p>
      </div>
      <div className="status-update">
        <span>Later release work</span>
        <h2>Production access and paid plans remain gated.</h2>
        <p>Full recovery from a lost database cluster, production security and data terms, broader integrations, configurable alerts, billing and service commitments need separate acceptance. Website plans and prices are proposals, not an available paid service.</p>
      </div>
      <div className="reading-list">
        <h2>Explore the platform.</h2>
        <a href="/portal">Synthetic governance demonstration <span>Illustrative data →</span></a>
        <a href="https://portal.orvessian.com/workspace">Sign in or create a pilot account <span>Synthetic test data only →</span></a>
        <a href="/technology">Architecture and assurance <span>What each check establishes →</span></a>
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

