import PricingPreview from './pricing-preview';
import { PageHeader, Footer } from '../../components';

export const metadata = {
  title: 'Governance plans preview | Orvessian',
  description: 'Explore Evaluate, Operate and Enterprise, with clear scope, proposed billing and current availability.',
  robots: { index: false, follow: false },
};

export default function GovernanceProductPreview() {
  return <main>
    <PageHeader label="Plans · synthetic demo available" title="One workflow today. A wider view tomorrow.">
      <p>Explore how Orvessian brings agent activity, model outcomes and decision evidence into one governance workspace. Compare the proposed plans below.</p>
    </PageHeader>
    <PricingPreview />
    <section className="foundation-content">
      <p className="eyebrow">Evidence and availability</p>
      <h2>Know what the record can tell you.</h2>
      <p>Base anchors provide a public commitment to recorded batches. Authorised record exports let a reviewer check integrity and inclusion independently. They do not establish that every event was captured or that a decision was correct or safe.</p>
      <p>The public demonstration uses synthetic data. An authenticated private development workspace demonstrates record investigations and verification. Public customer onboarding, production deployment and paid service remain gated.</p>
      <a className="arrow-link" href="/status">Read the current readiness summary <span aria-hidden="true">→</span></a>
    </section>
    <Footer />
  </main>;
}
