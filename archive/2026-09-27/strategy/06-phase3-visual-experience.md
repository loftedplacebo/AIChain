# Orvessian — Phase 3 visual experience

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](C:/AIChain/docs/platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

13 September 2026.

Published privately at https://orvessian.mjgrant.chatgpt.site. Live checks confirmed hero layer selection, the more-evidence branch carried into the receipt, and native navigation to Technology.

## Delivered scope

The homepage now has a cinematic Living Receipt: three floating glass layers with authority, evidence and review explanations. It is pre-rendered 3D concept artwork with subtle CSS motion, not a live WebGL model or a verified record. The navy, ivory and amber system stays intact. Existing collaboration and robotics photography remains on the other pages.

The In action page adds six interactive chapters: brief, evidence, exception, human decision, receipt and later comparison. Accepted, more-evidence and rejected paths carry through to the receipt. Chapter and path are recorded in the URL fragment. Controls support direct selection, previous/next/restart and keyboard navigation when the story region has focus. All content and alternative outcomes also remain readable below the interactive story.

The reusable evidence-boundary diagram distinguishes private source material, selected disclosure and checking against an anchor. No live approval, signature verification, customer result or purchase authorisation is implied.

## Validation and limitations

- Production build and all ten route/content/anchor checks passed. Native anchors retained; source check prevents reintroduction of the failing framework Link dependency.
- Browser-tested hero layer selection and motion pause, mobile menu, acceptance/rejection persistence, chapter controls, keyboard End/restart and restoration after reload.
- Desktop and mobile screenshots inspected. The tested mobile layout had equal document and viewport widths, with no horizontal overflow.
- Motion stops on small screens and under prefers-reduced-motion. A pause control is available on desktop. Reduced-motion rules were source-reviewed, not tested by changing the operating system setting.
- Full story is server-rendered and available without interactive controls. No complete screen-reader audit or no-JavaScript browser session is claimed.
- No new rendering library or WebGL dependency. Hero has intrinsic dimensions and high fetch priority. Source image is 1,835,049 bytes; network-throttled LCP and conversion benchmarking remain Phase 6 work.

## Original art provenance

Mode: built-in image generation, one generation, no subsequent edits. Final asset: `site/public/living-receipt-hero.png`, 1536 × 1024. Original also retained in `phase3-assets/living-receipt-hero.png`.

The prompt requested four wafers; the generated composition contains three. We used those three consistently for authority, evidence and review rather than claiming a fourth visible layer. The whole sculpture represents the receipt.

Exact generation prompt:

```text
Use case: stylized-concept
Asset type: original raster hero artwork for the Orvessian website, landscape 3:2.
Scene/backdrop: seamless dark navy #10273a studio background.
Primary request: premium cinematic 3D-rendered sculptural Living Receipt, an abstract piece of product art suggesting layers of authority, evidence, review, and record.
Subject: exactly four separated floating horizontal rounded-rectangular mineral glass wafers aligned vertically; translucent smoky blue glass with fine warm amber metal edges; a fine amber light passing through their central alignment.
Style/medium: highly sophisticated physically rendered 3D artwork with realistic caustics, refraction, and beautifully controlled glass reflections.
Composition/framing: centered object fills frame with generous safe margins, three-quarter isometric view, landscape 3:2 suitable for the right half of a website hero.
Lighting/mood: warm ivory highlights and amber #ffae42 light, serene engineered precision, premium cinematic studio lighting.
Constraints: abstract sculpture, not a hardware device. No text, logos, icons, cryptocurrency coins, people, watermark, UI, or frames.
```

## Next phase

### Liquid-light sequence

Follow-up refinement: enlarged the droplet to 23–34px with smoky blue reflective gradients and an amber rim. The cycle now lasts ten seconds, with approximately 0.9 seconds of slow passage at each intermediate surface. Final absorption expands an amber-tinted copy of the existing transparent glass image from the contact point to the whole pane, preserving the original silhouette and reflections. This is a single smooth charge/fade, not rapid flicker. Ripples, pause and reduced-motion support remain. Build and ten route checks passed; no browser animation audit is claimed.

The user selected liquid light with water-like absorption on the final glass surface. The eight-second CSS sequence includes a stretching amber/ivory drop, short surface glows at the first two crossings, compression and disappearance at the final contact, a simulated dimple and two perspective-flattened rings. Surface movement holds at known contact coordinates during the descent; rings inherit the final layer's movement. A quiet interval follows the ripple decay. This is a stylised animation, not fluid simulation or a real verification event. The transparent cutout is unchanged; no backgrounds or new raster slices are introduced. Pause freezes all animated descendants and reduced-motion hides the effects. Build and all ten route checks passed; no browser/frame-rate audit is claimed.

### Transparent-layer repair

The sliced animation exposed moving rectangular backgrounds and crop seams. A subsequent generated single-wafer cutout had a baked-in checkerboard instead of alpha. With explicit user approval, local Pillow/NumPy processing removed that background, retained the connected glass silhouette, filled internal mask holes and inset/softened its edge. The original is preserved in `phase3-assets/glass-wafer-transparent.png`; reproducible processing is `phase3-assets/extract-wafer.py`; the verified final asset is `site/public/glass-wafer-alpha.png` (1536 × 1024 RGBA, 68.9% fully transparent pixels, all outer edges alpha zero).

The site now reuses the whole transparent wafer at three heights over the unchanged stationary navy background. Polygon cropping and screen blending have been removed from moving layers. Motion, pulse, cursor response and reduced-motion/pause controls remain. The cutout was visually inspected against navy; build, all ten routes, and a source regression preventing cropped backdrop slices passed. No browser animation audit is claimed for this repair.

### Motion follow-up

The initial 8px whole-image drift was too subtle and was disabled on narrow screens. The follow-up composites the existing raster artwork into three independently animated regions, adds an amber travelling pulse, and uses bounded mouse-position tilt. Mobile motion and a visible pause control are now retained. Reduced-motion preferences disable the animations and cursor tilt. These remain animated raster layers, not an interactive WebGL model. Build and ten route checks passed; this follow-up did not include a browser-motion or frame-rate audit. Earlier notes about motion stopping on small screens describe the initial implementation and are superseded by this update.

Phase 4 is the technical publication: a versioned whitepaper, reproducible developer journey and claim review against pinned source. This visual phase does not claim that the whitepaper or investor deck is finished.
