# SEO review and launch plan — 30 September 2026

## Current finding

The hosted Site is currently owner-only. Search crawlers cannot index marketing pages until the access policy deliberately becomes public. The source changes below prepare the public pages; they do not change that access policy or publish a new version.

## Implemented in source

- Added root `robots.txt` and an XML sitemap listing only the preferred public content URLs. API routes are disallowed from crawling; access control still has to protect them.
- Added self-referencing absolute canonical URLs to the public routes. The duplicate paths `/technical`, `/use-cases` and `/products/governance-preview` point to `/technology`, `/in-action` and `/products` respectively. Internal plans links now use `/products`.
- Added an actual social preview image and consistent title/description metadata, while preserving page copy and visual design.
- Kept the synthetic portal, customer workspace and alpha testnet explorer out of the sitemap and marked them `noindex`.
- Added short platform FAQs and one linked, source-based guide to EU AI Act logging and evidence preparation. The guide distinguishes what the pilot does from legal compliance.
- Linked to the actual pilot contract on BaseScan and to Base documentation as relevant references.
- Added a rendered-route test for headings, descriptions, canonicals, sitemap coverage and `noindex` routes.

## Publication steps

1. Select the permanent public hostname. If it changes, update `app/layout.tsx`, `public/robots.txt`, `public/sitemap.xml` and the SEO test together. Redirect other hostname variants to it.
2. Publish the reviewed site and make only the intended marketing pages publicly accessible. Keep `/workspace` and API authorisation server-side. Confirm an anonymous crawler gets HTTP 200, rendered content, the canonical URL, `robots.txt` and `sitemap.xml`.
3. Verify the site in Google Search Console and Bing Webmaster Tools, submit the sitemap, and inspect the canonical and indexing reports. A sitemap helps discovery but does not guarantee indexing or ranking.
4. Check the live pages on mobile for rendering, page speed and image transfer size. Use real field data once traffic exists. Refresh the dated status page when pilot facts change.

## Content and links

One strong regulation guide is a useful start. Expand only after there is distinct, maintained material: an AI Act event-record example, a deployer/provider responsibility comparison, or a worked evidence export. Each should cite the current official text and show how the actual product workflow relates to it. Do not claim the tool alone satisfies the Act, DORA or a certification.

Outbound links to Base or BaseScan help readers verify technical claims; they do **not** create inbound link equity for Orvessian. For relevant backlinks after the site is public, publish the runnable receipt example and verification method in the existing GitHub repository with a clear website link, seek references from genuine pilot write-ups or technical collaborators, and make the public guide worth citing. Avoid paid link schemes, generic directories and mass-produced regulation pages.

## Sources checked

- [Google Search Central: sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google Search Central: canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google Search Central: robots meta tags](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [EU Artificial Intelligence Act](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng)
- [European Commission: navigating the AI Act](https://digital-strategy.ec.europa.eu/en/faqs/navigating-ai-act)
