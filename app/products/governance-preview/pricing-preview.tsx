import './plans.css';

const tiers = [
  {
    name: 'Evaluate', label: 'Explore one workflow', price: 'Free',
    billing: 'Synthetic demo available now',
    description: 'See how activity, outcomes and evidence fit together before planning an integration.',
    features: ['Explore illustrative agent activity', 'Review sample decisions and outcomes', 'Try synthetic report downloads'],
    next: 'Planned: developer sandbox with 5,000 events per month, structured event ingestion and a guided SDK example.',
    href: '/portal', action: 'Try the synthetic demo',
  },
  {
    name: 'Operate', label: 'Bring your team together', price: '£99 / month',
    billing: 'Or £990 billed annually · save £198',
    description: 'Give engineering, operations and reviewers a shared place to investigate AI activity.',
    features: ['100,000 events per month', 'Reviewer collaboration and outcome comparisons', 'Investigations and ordinary evidence exports', '£10 per additional 10,000 events'],
    next: 'Planned: configurable rules, alert delivery, incident ownership and usage budgets.',
    href: '/product', action: 'Explore the platform',
  },
  {
    name: 'Enterprise', label: 'Coordinate your organisation', price: 'From £999 / month',
    billing: 'From £11,988 billed annually',
    description: 'Plan wider governance around your access, integration and service requirements.',
    features: ['From 1 million events per month', 'Tailored onboarding and integration planning', 'Agreed organisation scope and overage rates', 'Implementation services scoped separately'],
    next: 'Planned: enterprise identity, custom retention, deployment options and contracted support.',
    href: '/status', action: 'Review current readiness',
  },
];

const comparison = [
  ['What you can access today', 'Public synthetic demo', 'Synthetic / private pilot capability only', 'Requirements planning only'],
  ['Proposed monthly events', '5,000 in the planned sandbox', '100,000 included', 'From 1 million; final scope agreed'],
  ['Additional events', 'Capped sandbox; no paid overages', '£10 per 10,000 additional events', 'Rates agreed in the contract'],
  ['Reviewer collaboration', 'Explore the demo', 'Included collaboration proposed; limits unset', 'Organisation scope to agree'],
  ['Evidence', 'Synthetic report examples', 'Record exports demonstrated in private pilot', 'Same verification foundation proposed'],
  ['Rules, alerts and incident workflow', 'Not available', 'Planned', 'Planned'],
  ['SDK and tool integrations', 'Local prototype example', 'Supported adapters planned', 'Additional integrations subject to scope'],
  ['Retention and support', 'No customer-data service', 'Terms to be determined', 'Custom requirements to validate'],
];

export default function PricingPreview() {
  return <section className="plans-section" aria-labelledby="plans-heading">
    <div className="plans-inner">
      <div className="plans-heading">
        <p className="eyebrow">Evaluate · Operate · Enterprise</p>
        <h2 id="plans-heading">Start with understanding.<br />Grow into ongoing governance.</h2>
        <p>Explore the demo today. Our proposed paid plans combine a shared workspace with a clear event allowance and transparent additional usage.</p>
      </div>
      <p className="plans-notice"><strong>Indicative launch pricing.</strong> Prices are in GBP, excluding applicable taxes, and may change before launch. Paid plans, public API onboarding and production service are not available yet. Features and allowances below describe the proposed plans.</p>
      <div className="plans-grid">
        {tiers.map(tier => <article className="plan-card" key={tier.name}>
          <p className="eyebrow">{tier.label}</p>
          <h3>{tier.name}</h3>
          <p className="plan-price">{tier.price}</p>
          <p className="plan-billing">{tier.billing}</p>
          <p>{tier.description}</p>
          <h4>{tier.name === 'Evaluate' ? 'In the demo today' : 'Proposed scope'}</h4>
          <ul>{tier.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
          <p className="plan-next">{tier.next}</p>
          <a className="button primary" href={tier.href}>{tier.action} <span aria-hidden="true">→</span></a>
        </article>)}
      </div>
      <div className="plans-comparison">
        <h3>Compare scope and availability</h3>
        <p>Demonstrated pilot capabilities are distinct from a publicly available managed service.</p>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The named overflow region needs keyboard focus so the comparison can be scrolled without a pointer. */}
        <div className="plans-table-scroll" role="region" aria-label="Plan comparison, scroll horizontally on small screens" tabIndex={0}>
          <table>
            <caption>Current access and proposed plan scope</caption>
            <thead><tr><th scope="col">Capability</th>{tiers.map(tier => <th scope="col" key={tier.name}>{tier.name}</th>)}</tr></thead>
            <tbody>{comparison.map(([feature, ...values]) => <tr key={feature}><th scope="row">{feature}</th>{values.map((value, index) => <td key={tiers[index].name}>{value}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className="plans-principles">
        <article><h3>A clear usage measure</h3><p>The proposed unit is one durably accepted governance event. A model run can produce several events. Identical retries, rejected events and reads would not add accepted-event charges. Allowances reset monthly, including on annual plans. Operate overages are proposed at £1 per 1,000 extra events, shown as £10 per 10,000. Spend caps and retention terms will be agreed before launch.</p></article>
        <article><h3>Evidence belongs in the workflow</h3><p>Ordinary record exports are part of the proposed paid workspace. Independent verification tools are intended to remain freely accessible. A receipt supports record integrity and inclusion; it does not prove the decision was correct.</p></article>
        <article><h3>Keep your existing tools</h3><p>Orvessian is designed to sit beside agent frameworks and monitoring tools. Supported SDK adapters are planned. Conversations, documents and raw sensor data stay in your systems. No token purchase or wallet is required in the proposed customer experience.</p></article>
      </div>
      <div className="plans-start"><div><h3>Start with a decision you can investigate.</h3><p>Follow an illustrative workflow in the demo, then review the local developer example.</p></div><a className="arrow-link" href="/developers">Explore developer tooling <span aria-hidden="true">→</span></a></div>
    </div>
  </section>;
}
