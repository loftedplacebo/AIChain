import { Footer, PageHeader } from '../components';
import PricingPreview from './governance-preview/pricing-preview';

export const metadata = {
  title: 'Plans | Orvessian',
  description: 'Compare Evaluate, Operate and Enterprise: a synthetic demo today and proposed governance workspace plans.',
  openGraph: { images: [] }, twitter: { images: [] },
};

export default function Products() {
  return <main>
    <PageHeader label="Plans · preview" title="Governance that grows with your team.">
      <p>Understand agent activity, review outcomes and investigate decisions with independently checkable evidence. Start with the synthetic demo and explore the proposed plans.</p>
    </PageHeader>
    <PricingPreview />
    <section className="products-next">
      <p className="eyebrow">The underlying product</p>
      <h2>A shared account of your AI operations.</h2>
      <p>The workspace brings selected structured decisions and outcomes into a review workflow. Agent execution and real-time controls stay with your existing systems.</p>
      <a className="arrow-link" href="/product">Explore the platform <span aria-hidden="true">→</span></a>
    </section>
    <Footer />
  </main>;
}
