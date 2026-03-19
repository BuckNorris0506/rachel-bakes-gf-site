# Bantry Plastics — Site Planning (Pre-Build)

**Status:** Planning only. Do not build until approved.

---

## A. Site Architecture

```
/ (Home)
├── /capabilities/
├── /industries/          (or /solutions/ — Industries / Solutions)
├── /gallery/
├── /about/
├── /request-quote/       (Request a Quote)
└── /contact/
```

**Notes:**
- **Home** — Entry point: hero, capability strip, featured work, industries, why Bantry, process, materials teaser, final CTA.
- **Capabilities** — Single page covering: CNC machining, laser cutting/engraving, vacuum forming/thermoforming, bending & bonding, CAD design, custom fabrication. Clear, scannable; light copy, strong visuals.
- **Industries / Solutions** — Medical, display, commercial, industrial, specialty. Short value props per segment; link to quote where relevant.
- **Gallery** — Visual proof: product photography by category or project type. Filterable or simple grid. High-res, captioned.
- **About** — Company story: family-owned, location, what they stand for (quality, on-time, accuracy, complexity, deadlines). Team/place optional. Keep concise.
- **Request a Quote** — Form-focused: project type, quantity, materials, specs, deadline, contact. Minimal friction; optional file upload for drawings.
- **Contact** — Address, phone, email, map optional. Can merge with Request a Quote if preferred; kept separate here so “Contact” is low-commitment and “Request a Quote” is intent-specific.

**Global:** Header (logo, nav), footer (contact snippet, key links, optional social). No blog or news unless you add later.

---

## B. Homepage Wireframe

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Logo]     Capabilities  Industries  Gallery  About  [Request a Quote]  │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                    [HERO IMAGE — full-bleed]                            │
│                    Product/fabrication focus                            │
│                                                                         │
│              HEADLINE (one of three options below)                      │
│              Subheadline                                                │
│                                                                         │
│                    [Request a Quote]  [See Our Work]                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  CAPABILITY STRIP / GRID                                                │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                 │
│  │ CNC  │ │Laser │ │Vacuum│ │Bend &│ │ CAD  │ │Custom│                 │
│  │Mach. │ │Cut   │ │Form  │ │Bond  │ │Design│ │Fab   │                 │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                 │
│  Short label per capability → links to /capabilities/#section            │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  FEATURED WORK                                                          │
│  [Img] [Img] [Img]   — 3–6 strong product shots                         │
│  [Img] [Img] [Img]   — “See full gallery” link                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  INDUSTRIES / SOLUTIONS                                                 │
│  Medical | Displays | Commercial | Industrial | Specialty               │
│  One line or card per segment → /industries/                            │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  WHY BANTRY                                                             │
│  • Family-owned • Highest quality • On-time • Accuracy & complexity     │
│  • In-house design, fabrication, inventory, distribution               │
│  • Custom, small-quantity, non-standard welcome                         │
│  (Bullets or minimal icons; no walls of text)                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  PROCESS                                                                │
│  Concept → Design → Fabricate → Deliver   (simple linear strip)         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  MATERIALS TEASER                                                       │
│  “We work with the materials you need” — 2–4 material icons/names       │
│  Link to /capabilities/ or short list (acrylic, polycarbonate, etc.)   │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  FINAL CTA                                                              │
│  “From Concept to Reality” — [Request a Quote]                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  FOOTER                                                                 │
│  74 North Central Drive, O'Fallon, MO 63366  |  (636) 272-1398          │
│  sales@bantryplastics.com  |  Capabilities  Industries  Gallery  About  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Wireframe principles:** Product imagery leads. Plenty of vertical spacing between sections. One primary CTA (Request a Quote) repeated in hero and final block. No sidebar; single-column, full-width where it helps the imagery.

---

## C. Hero Headline / Subheadline Options

**Option 1**  
- **Headline:** Custom Plastic Fabrication, Done Right  
- **Subheadline:** From concept to reality — CNC machining, laser cutting, thermoforming, and more. Precision work for medical, display, and industrial applications.

**Option 2**  
- **Headline:** From Concept to Reality  
- **Subheadline:** Custom plastic fabrication and precision machining for businesses that need quality, accuracy, and on-time delivery. Family-owned. In-house from design to delivery.

**Option 3**  
- **Headline:** Precision Plastic Fabrication for Your Ideas  
- **Subheadline:** Custom parts, displays, enclosures, and specialty fabrication. Small runs and complex jobs welcome. Design, build, and deliver — under one roof.

**Recommendation:** Option 2 keeps the approved tagline “From Concept to Reality” as the main headline and weaves in trust (family-owned, in-house, on-time). Option 1 is more capability-forward; Option 3 is more “ideas/projects” forward. Choose based on whether you want tagline-first (2), capability-first (1), or project-first (3).

---

## D. Visual Direction Summary

| Principle | Direction |
|-----------|-----------|
| **Look** | Modern, precise, capable, clean. Industrial but polished. Product-led. Not contractor, not generic, not trendy startup. |
| **Typography** | Simple, modern. One clear sans for headings (confident, not loud), one for body (readable, neutral). Limited weights (e.g. regular, semibold). No decorative or script. |
| **Color** | Clean dark/light contrast. e.g. Dark nav/footer + light content, or light nav + white/off-white sections with dark text. One accent for CTAs (e.g. one strong blue or industrial green). Avoid busy gradients and multiple bright colors. |
| **Imagery** | Product photography is the star. Real parts, displays, enclosures, medical/fabrication shots. No stock “handshakes in offices.” Prefer well-lit, sharp, context shots (shop, bench, or clean neutral background). |
| **Layout** | Minimal but credible. Strong spacing (padding and section rhythm). Full-bleed hero; content in readable max-width where appropriate. Grid for capabilities and gallery. No clutter. |
| **UI** | Buttons and forms: simple, high-contrast, clear hierarchy. “Request a Quote” is the primary action. No cartoon icons or playful illustration unless it fits a specific “solutions” section. |
| **Trust** | Convey precision and capability through imagery and short copy (Why Bantry, process, materials). Avoid long technical walls; link to Capabilities for detail. |

**Mood:** A capable shop you’d send a drawing to and trust with a deadline — professional, clear, and confident without being cold or generic.

---

## E. Hero and Featured Work — Image Recommendations

**Hero**
- **Use:** One strong product-led image that reads as “custom plastic fabrication” at a glance.
- **Ideal content:** A signature product (e.g. medical tray, custom enclosure, display, or precision-machined part) in focus; optional context (bench, clean shop, or neutral backdrop). Well-lit, sharp, high resolution.
- **Avoid:** Group photos, generic factory wide shots, or cluttered scenes. No text overlay on the main focal area.
- **Fallback if no single hero yet:** One of the best gallery shots (enclosure, display, or medical part) cropped for wide aspect ratio (e.g. 16:9 or 21:9). Prefer a single hero over a slider.

**Featured Work (homepage)**
- **Use:** 3–6 images that prove range and quality.
- **Ideal mix:**  
  - At least one **medical** (tray, holder, device part).  
  - At least one **display/enclosure** (retail, kiosk, or industrial enclosure).  
  - At least one **precision/shop** (CNC or laser work, clean part).  
  - Optional: thermoformed part, bent/bonded assembly, or signage.
- **Style:** Consistent lighting and quality; same aspect ratio (e.g. 4:3 or 1:1) for a clean grid. Short captions (product type or application, not jargon).
- **Avoid:** Duplicate-looking shots, low-res or dark images, stock that doesn’t match real work.

**Asset needs before build**
- Confirm 1 hero image (file or selection from gallery).
- Confirm 3–6 featured images with captions.
- If no photos yet: plan a short photo list (hero + 3–5 featured) so the build can use placeholders with correct aspect ratios and labels.

---

**Next step:** Approve this architecture, wireframe, hero option, visual direction, and image plan. Then the full site build can start from zero with no reuse of the old structure.
