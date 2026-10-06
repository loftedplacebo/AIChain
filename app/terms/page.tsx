import { Footer, PageHeader } from "../components";

export const metadata = {
  title: "Terms draft | Orvessian",
  description: "Draft terms for the Orvessian public website and synthetic pilot.",
  robots: { index: false, follow: false },
};

export default function Terms() {
  return <main>
    <PageHeader label="Terms · draft for operator review" title="Using the website and pilot.">
      <p>These draft terms are not yet in force. The operator identity, contact method, legal jurisdiction and liability wording need review before anyone is asked to accept them.</p>
    </PageHeader>
    <section className="foundation-content narrow">
      <div className="notice"><strong>Publication details to complete</strong><p>Provider: [LEGAL PERSON OR COMPANY]. Contact: [WORKING SUPPORT EMAIL]. Address and company number, if applicable: [CONFIRM]. Effective date: [SET WHEN APPROVED].</p></div>

      <h2>What is available now</h2>
      <p>Orvessian provides a public marketing website, an illustrative synthetic-data demonstration and a limited, approval-only pilot workspace. Requesting access does not create an account or guarantee an invitation. The pilot may change or pause while it is being developed. No paid plan, checkout, production service level or general public API entitlement is currently offered.</p>

      <h2>Accounts and access</h2>
      <p>Approved users must use their own verified account, protect their credentials and complete the required multi-factor sign-in. Workspace owners are responsible for the people and project keys they authorize. An API key must be kept secret, scoped to its intended use and revoked when no longer needed. We may suspend access to protect the service or investigate misuse, with a contact process to be specified before publication.</p>

      <h2>Permitted pilot use</h2>
      <p>The first partner trials are supervised and use only the agreed synthetic or explicitly non-sensitive structured fields. Do not submit source prompts, conversations, documents, media, sensitive personal information or another person’s production data unless a separate written agreement expressly permits that use. Do not probe, overload, bypass access controls, reverse engineer a restricted service or interfere with other users.</p>

      <h2>Records and evidence</h2>
      <p>A user remains responsible for the data and rights needed to submit a record. Orvessian may process submitted records only to provide, secure and support the agreed pilot, subject to the privacy notice and any separate partner agreement. A signed receipt or Base Sepolia testnet anchor can support integrity and inclusion checks; it does not establish that a source event was complete or true, that an AI decision was correct, or that a system was safe. Testnet availability and confirmation can change.</p>

      <h2>Future paid service</h2>
      <p>Plans, prices and allowances shown on the website are proposals. They do not create an order or a right to use a paid service. If paid service becomes available, its price, term, support, service commitments, data-processing provisions and cancellation terms must be presented and accepted separately before charges or production access begin. [REVIEW the intended contracting and checkout process before publication.]</p>

      <h2>Availability, changes and ending a trial</h2>
      <p>The free pilot is provided for evaluation, without a production availability commitment. The parties should agree its dates, support contacts, pause process, export and deletion steps in a separate pilot brief. We may change or stop the pilot, subject to that agreement and applicable law. [REVIEW notice periods, remedy and liability language with the legal operator.]</p>

      <h2>Law and contact</h2>
      <p>[CONFIRM governing law, courts, dispute process and any mandatory consumer or business protections.] Questions about these terms should go to [WORKING SUPPORT EMAIL].</p>

      <div className="reading-list"><h2>Related information</h2><a href="/privacy">Privacy notice draft <span>Information handling →</span></a><a href="/status">Platform status <span>Current availability →</span></a></div>
    </section>
    <Footer />
  </main>;
}
