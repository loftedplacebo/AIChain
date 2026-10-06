import { Footer, PageHeader } from "../components";

export const metadata = {
  title: "Privacy notice draft | Orvessian",
  description: "Draft privacy information for the Orvessian website, waitlist and synthetic pilot.",
  robots: { index: false, follow: false },
};

export default function Privacy() {
  return <main>
    <PageHeader label="Privacy · draft for operator review" title="How Orvessian handles personal information.">
      <p>This draft is not yet an operative privacy notice. The legal operator, contact address, lawful bases, retention periods and provider transfer details must be confirmed before publication.</p>
    </PageHeader>
    <section className="foundation-content narrow">
      <div className="notice"><strong>Publication details to complete</strong><p>Operator: [LEGAL PERSON OR COMPANY]. Privacy contact: [WORKING EMAIL ADDRESS]. Postal address and company number, if applicable: [CONFIRM]. Last reviewed: 4 October 2026.</p></div>

      <h2>What this notice covers</h2>
      <p>This notice is intended to cover visits to orvessian.com, requests to join the pilot waitlist, and accounts in the approval-only synthetic pilot. A separate partner agreement and data-processing terms would be needed before a partner submits real operational or personal data through the service. The public demo contains illustrative synthetic records.</p>

      <h2>Information involved</h2>
      <h3>Website and waitlist</h3>
      <p>A visitor may give an email address to request access. The website and its hosting providers also process technical request information, such as IP address, browser information, timestamps and security logs needed to deliver and protect the site. [CONFIRM whether any analytics or non-essential cookies are enabled in the deployed hosting configuration.]</p>
      <h3>Pilot accounts</h3>
      <p>If access is approved, the identity service handles account details, email verification, authentication and multi-factor enrolment. Orvessian keeps the account and session information needed to apply its exact-email admission rule, workspace permissions and audit controls. The portal uses necessary session and security cookies.</p>
      <h3>Submitted pilot records and support</h3>
      <p>An admitted user can submit selected structured governance records and related identifiers. The first supervised trial is limited to agreed synthetic or explicitly non-sensitive fields; source conversations, documents and media should remain in the partner’s systems. Messages sent to the support or privacy contact will contain whatever the sender includes.</p>

      <h2>Why information is used</h2>
      <p>Waitlist details are used to review access requests and send related account messages. Account and technical information is used to authenticate users, enforce permissions, secure the pilot and investigate faults. Submitted pilot records are used to provide the requested workspace and evidence functions. [CONFIRM the lawful basis for each purpose and document the assessment before publication.] We do not treat a waitlist request as consent to marketing email.</p>

      <h2>Who receives information</h2>
      <p>The current pilot uses WorkOS for identity and account email, a Sites/Cloudflare service for the public website, Contabo for the portal/API host, DigitalOcean for the managed database and Backblaze B2 for encrypted backups. GoDaddy provides domain registration and DNS. Each provider receives only the information required for its function. [CONFIRM the current provider list, processing locations, contracts and any international transfer safeguards.]</p>

      <h2>Security, retention and deletion</h2>
      <p>Access is limited to approved accounts, and the pilot requires authenticator-app MFA. Database backups are encrypted before upload to a separate provider. The B2 bucket hides backup objects after 14 days and removes hidden versions after at least one further day, subject to its daily lifecycle processing. This backup rule is not a general retention period for accounts, waitlist requests, logs or submitted records. [CONFIRM those periods, deletion and legal-hold procedures before publication.]</p>

      <h2>Cookies and similar technology</h2>
      <p>The sign-in journey uses cookies needed for authentication and security. [CHECK WorkOS and hosting cookies and confirm whether any analytics or other optional technology is active.] If non-essential cookies are added, provide a separate choice before using them where required.</p>

      <h2>Your choices and rights</h2>
      <p>Depending on applicable law, a person may ask for access, correction, deletion, restriction or portability of their information, and may object to some uses. They may also complain to the relevant data-protection authority. [CONFIRM the operator’s jurisdiction, the correct authority and the contact process.] Requests should go to [WORKING PRIVACY EMAIL]. We will update this notice when the service or our practices change.</p>

      <div className="reading-list"><h2>Related information</h2><a href="/status">Platform status <span>Current pilot boundaries →</span></a><a href="/terms">Terms draft <span>Access and use →</span></a></div>
    </section>
    <Footer />
  </main>;
}
