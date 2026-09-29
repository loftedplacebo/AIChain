# Orvessian — development phases

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](C:/AIChain/docs/platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

12 September 2026 · Delivery plan for the approved strategy.

Each phase delivers a coherent increment. Preserve the website's current private audience. No protocol changes or public-network launch are implied. Phases 1–3 have been authorised; later phases are sequenced work, not unattended future execution.

| Phase | Deliverable | Completion gate |
|---|---|---|
| 1. Foundation | Positioning and homepage; responsive navigation; Product, Technology, Developers, In action, Whitepaper overview and project status | Build and route checks; accurate alpha/vision labels; private publication |
| 2. Product story | Detailed flagship narrative, changed-evidence/rejection branches, expanded Vision and private/public boundary explanation | Nontechnical reader can explain who acts, who reviews and what is recorded |
| 3. Visual experience | Living Receipt 3D asset, chaptered slideshow, refined photography and reusable infographics | Static/reduced-motion fallbacks; keyboard/touch access; mobile visual and performance checks |
| 4. Technical publication | Versioned HTML/PDF whitepaper, task-based docs, compatibility tables and reproducible examples | Pinned-commit claim review; independent quickstart trial; HTML/PDF parity; sanitised evidence |
| 5. Investor story | Company page, 14-slide deck, send-ahead PDF and diligence appendix | Real team/buyer evidence, sourced market model and costed funding ask |
| 6. Launch validation | Cross-device/accessibility testing, metadata/link review, performance and conversion instrumentation | Critical issues resolved; privacy-appropriate measurement; audience unchanged unless explicitly requested |

## Dependencies and scope

Phase 2 builds on Phase 1; Phase 3 needs the Phase 2 story locked. Phase 4 can proceed after the foundation, subject to technical review. Phase 5 reuses the product story and reviewed technical evidence, plus founder inputs. Phase 6 evaluates the completed experience.

Phase 1 preserves the existing collaboration and robotics images, blue/ivory/amber palette and blocks. It does not build placeholder 3D art, a fake PDF download, unconnected contact forms, token dashboards or the full investor deck. The whitepaper page is explicitly an overview, not the finished paper. The initial use-case narrative is readable before the interactive slideshow is added.

Keep `/technical` and `/use-cases` working for existing links; new navigation uses `/technology` and `/in-action`. Phase 2 adds `/vision`, linked from the homepage and navigation. Company content waits for Phase 5 facts.

## Phase 1 acceptance

- Homepage communicates the verification-layer proposition and links directly to developers.
- Every navigation destination has substantive content; mobile navigation remains available.
- Technology explains the independent L1 and separates general receipts from authorised AVR proofs.
- Scenarios and robotics ambitions are labelled; no universal verified badge or invented email remains.
- Whitepaper overview does not claim a finished paper or offer a nonexistent download.
- Build and route checks pass; private publication is confirmed before declaring delivery.

## Inputs required later

Founder/team biographies and a real contact channel; buyer interviews and pilot evidence; reviewed public repository commit; independently reproduced examples; approved technical claims; market model and funding budget. These must not be invented to populate future pages.

## Delivery record

Phase 1: completed and privately published on 12 September 2026 at https://orvessian.mjgrant.chatgpt.site.

Validation: production build passed; all nine new and compatibility routes returned HTTP 200 with page headings; legacy invented email and contradictory chain claims were absent; referenced GitHub documents were reachable; source whitespace checks passed. Existing photography, palette and owner-only access were preserved. Full cross-device visual/accessibility and conversion validation remains Phase 6, with interaction-specific checks also required during Phase 3.

Phase 2: completed and privately published on 13 September 2026 at https://orvessian.mjgrant.chatgpt.site. Includes the full illustrative supplier story, accepted/more-evidence/rejected paths, new/mismatched/missing evidence, shared disclosure boundaries and a dedicated Vision page. See [story contract and Phase 3 hand-off](05-phase2-story-contract.md).

Validation: production build passed; all ten routes passed local HTTP, expected-content and same-page-anchor checks. No moderated audience-comprehension study or full cross-device visual review is claimed.

Phase 3: implemented and privately published on 13 September 2026. The Living Receipt artwork, three explorable layers, six-chapter branching slideshow and reusable disclosure infographic are live. Local desktop/mobile interaction checks and live hero, story and page-link checks passed. Motion controls and readable fallbacks are included. Network-throttled performance benchmarking and a full accessibility audit remain Phase 6 work. See [visual experience delivery and asset brief](06-phase3-visual-experience.md).

Phases 4–6: planned, not started. Next: Phase 4, the technical whitepaper and reproducible developer journey.

### Navigation repair — 13 September 2026

The initial HTTP checks missed a production click failure: the framework Link component intercepted navigation and threw a client-side TypeError. Replaced framework links with native anchors across the marketing site; no design or content changes. Added a source regression check to prevent reintroducing this dependency.

Production build and all ten route checks passed. Actual browser clicks were then verified locally and on the published private site for all six main navigation destinations, the homepage's In action button, a story chapter anchor and the footer's Project Status link. The live site initially served a stale deployment; a fresh response exposed the repaired build, after which normal homepage navigation also passed. This is click-navigation validation, not a complete accessibility audit.
