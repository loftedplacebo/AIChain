# Public privacy and terms pages — draft review, 4 October 2026

The public status page was corrected and published as Orvessian Site version 30
from source commit `28e44d18db4dc80d0c05d0b87f927918c4aa8aac`. The `/privacy`
and `/terms` routes and footer links are implemented and pass TypeScript and
production build checks in `C:/AIChain/site-publish`; their source has also been
ported into `C:/AIChain/website`. **They are local review drafts and were not
published in version 30.** The operator asked to defer legal-entity and public
contact details while setting up the company. Do not present the placeholder
copy as an operative notice or make the footer links live until review is done.

## Decisions and facts needed before publication

- Name the current legal person or company operating Orvessian, its jurisdiction
  and any address or registration number that must be disclosed. Do not silently
  treat a future company as the current contracting party.
- Create and test working inbound `privacy@orvessian.com` and
  `support@orvessian.com` addresses or choose another public contact. WorkOS
  sends authentication email; it does not supply an inbound mailbox. Its
  [email delivery options](https://workos.com/docs/email) concern outbound
  messages. GoDaddy documents [domain email setup](https://www.godaddy.com/en-uk/help/create-my-microsoft-365-email-address-9137)
  and [forwarding for eligible email products](https://www.godaddy.com/help/create-a-professional-email-forwarding-address-32113?v=1).
- Confirm the lawful basis for waitlist review, account operation, security
  logging and support; exact retention for waitlist requests, account data,
  records and logs; deletion process; cookie and analytics inventory; provider
  processing locations and transfer safeguards; and the relevant privacy-rights
  contact and supervisory authority. The B2 14-day object lifecycle does not
  set retention for these other categories.
- Have the terms' governing law, dispute, liability, suspension, notice and
  exit wording reviewed. Future paid plans should require a separate accepted
  order and commercial/data terms; proposed website prices are not an offer of
  service today.
- Before any real partner data, agree a separate pilot brief and, if personal
  data is involved, suitable controller/processor terms. The current pilot
  remains limited to agreed synthetic or explicitly non-sensitive fields.

## Research used for structure, not copied text

[LangChain](https://www.langchain.com/privacy-policy) and
[Arize](https://arize.com/privacy-policy/) distinguish website/account data
from customer data processed under a separate service agreement.
[Langfuse](https://langfuse.com/terms/terms/) separates cloud-service terms,
data-processing terms and paid subscriptions. The draft uses these distinctions
only where they fit Orvessian's current approval-only synthetic pilot.
The UK ICO's [right-to-be-informed guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/)
calls for clear notice at collection covering the operator, purposes, sharing
and retention. Neither competitor text nor this draft substitutes for review
of the actual operator and processing facts.
