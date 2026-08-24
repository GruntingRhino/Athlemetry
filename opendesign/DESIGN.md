---
name: Athlemetry Performance Design System
product: Athlemetry
version: 1.0.0
audience: athletes, coaches, parents, admins
posture: coach-grade, premium, structured, trustworthy
---

# 1. Frontmatter
Athlemetry is a multi-sport video performance intelligence app for structured drill uploads, metric extraction, benchmark comparison, and longitudinal athlete tracking.

# 2. Product identity
- Product type: mixed consumer + institutional sports analytics tool
- Core loop: pick a sport and drill, upload footage, review conservative analysis, compare to benchmark cohorts, act on feedback
- Value creation: a completed submission with reliable metrics and a clear interpretation
- Retention loop: repeat uploads, trend review, benchmark comparison, and coach/parent review
- Primary use environments: mobile capture on the field/court and desktop review in coaching/admin settings

# 3. Audience summary
| Audience | Role | Need | Evidence | Confidence |
|---|---|---|---|---|
| Athletes | primary user | upload clips, review metrics, track progress | `src/app/submissions/new/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/profile/page.tsx`, `src/app/register/page.tsx` | High |
| Coaches | secondary user / reviewer | compare drill quality, guide training, monitor groups | `src/app/page.tsx`, `src/app/drills/page.tsx`, `src/app/admin/page.tsx` | High |
| Parents | external stakeholder | consent, privacy, progress trust | `src/app/consent/page.tsx`, `src/app/privacy/page.tsx`, `src/components/forms/register-form.tsx` | High |
| Admins / operators | operator | queue processing, manual override, logs, model controls | `src/app/admin/page.tsx`, `src/app/admin/submissions/page.tsx`, `src/components/forms/model-controls.tsx` | High |
| Economic buyer | club, academy, school, training org, sometimes parent | trust, reporting, workflow reliability | no pricing page; institutional flows and admin tooling in `README.md`, `prisma/schema.prisma` | Medium |

# 4. Design posture
| Axis | Score | Why |
|---|---:|---|
| Formality | 3 | serious training product, not bureaucratic |
| Energy | 3 | active sports workflows, but calm visual tone |
| Density | 3 | metrics and logs matter, but not all screens are dense |
| Guidance | 4 | upload and calibration need explicit help |
| Expression | 2 | restrained brand; one or two accent colors only |
| Authority | 4 | outputs must feel coach-grade and trustworthy |
| Seriousness | 4 | performance, consent, and minors require care |
| Familiarity | 3 | conventional app patterns, sport-specific segmentation |
| Reward intensity | 2 | progress should feel encouraging, not game-like |
| Operational control | 4 | admin, queues, overrides, and cohort controls are real needs |

Design result: premium, structured, clear, and conservative. The interface should reassure athletes, coaches, and parents that the system is accurate even when it says a clip is unclear.

# 5. Design principles
1. Make sport context visible at all times.
2. Prefer evidence, status, and calibration over hype.
3. Keep the primary action obvious on every screen.
4. Use numbers carefully; show units and labels.
5. Separate athlete-facing, coach-facing, and admin-facing density.
6. Treat privacy and consent as first-class product flows.
7. Surface uncertainty explicitly instead of guessing.

# 6. Brand personality
- Confident, not loud
- Coach-grade, not clinical
- Premium, not flashy
- Supportive, not childish
- Structured, not bureaucratic
- Honest, not overpromising

# 7. Color tokens
Light mode only.

| Token | Value | Use |
|---|---|---|
| background | `#F6F8FB` | app background |
| surface | `#FFFFFF` | main cards and sheets |
| elevated surface | `#FFFFFF` | modals, overlays, floating panels |
| text primary | `#0F172A` | headings and key metrics |
| text secondary | `#475569` | body copy and helper text |
| muted text | `#64748B` | labels, timestamps, metadata |
| border | `#D9E1EE` | default separators and card borders |
| strong border | `#BFCBDA` | selected or emphasized boundaries |
| brand primary | `#0F766E` | primary CTA, active sport accent |
| brand hover | `#0B665F` | hover state for primary actions |
| brand active | `#09554F` | pressed state |
| brand subtle | `#E6F7F4` | tinted panels, selected chips |
| success | `#16A34A` | completed, approved, healthy trend |
| warning | `#D97706` | needs review, caution, unclear clip |
| error | `#DC2626` | failed processing, deletion, rejected state |
| information | `#2563EB` | charts, neutral informational notes |
| focus ring | `#3B82F6` | keyboard focus |
| disabled state | `#CBD5E1` | disabled controls and inactive affordances |

Chart accents:
- primary metric: `#2563EB`
- percentile: `#16A34A`
- composite score: `#D97706`
- neutral gridlines: `#E2E8F0`

# 8. Typography
- Font family: Inter
- Fallback stack: `Inter, "Segoe UI", "Avenir Next", system-ui, sans-serif`
- Display scale: 40/48, 32/40, 28/36
- Application headings: 24/32, 20/28, 18/26
- Body: 16/24
- Small: 14/20
- Micro / metadata: 12/16
- Weights: 700 for page titles, 600 for section titles and buttons, 500 for secondary labels, 400 for body
- Numeric typography: use tabular numbers for scores, percentiles, durations, and logs
- Mobile adjustment: reduce display headings one step and keep metric cards at readable 16–18px labels

# 9. Spacing
- Base unit: 4px
- Core scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64
- Screen gutters: 16px mobile, 24px tablet, 32px desktop
- Card padding: 16–24px standard, 24–32px for hero panels
- Section gaps: 24–40px depending on density
- Use roomy vertical rhythm on consumer/athlete screens; tighter rhythm on admin screens

# 10. Layout and grids
- App shell max width: 1280px
- Primary content width: 1120–1280px
- Mobile: 1 column
- Tablet: 2 columns for supporting content, 3–4 columns for KPIs
- Desktop: 4-column KPI rows, 2-column panels, full-width charts
- Use sticky top navigation for quick sport switching and account access
- Keep sport-specific query context visible in the page title or breadcrumb

# 11. Shape, borders, and elevation
- Small controls: 10–14px radius
- Cards and panels: 20–28px radius
- Pills and status chips: 999px radius
- Borders: 1px solid `#D9E1EE`
- Elevation: subtle shadow only; avoid heavy floating shadows
- Use slightly stronger shadow for hero surfaces and open overlays only

# 12. Iconography
- Use simple line icons with 1.5px stroke weight
- Prefer semantic icons for upload, trend, status, lock/privacy, admin, report, retry, and settings
- Icons should support text, not replace it
- Do not use decorative mascot icons or sports clipart as navigation elements

# 13. Imagery and illustration
- Prefer real product screenshots, drill footage thumbnails, and court/field imagery
- Use imagery to orient users, not to decorate empty space
- Avoid cartoon mascots, neon gradients, and exaggerated motivational art
- Hero imagery can be used on the marketing home, but application pages should stay mostly interface-first

# 14. Motion
- Keep motion short: 150–220ms
- Animate progress bars, chart transitions, and hover/focus states softly
- No springy or playful motion on admin, consent, or privacy screens
- Use motion to explain state changes, not to entertain

# 15. Content voice
- Direct and specific
- Confident, but not absolute
- Conservative when footage is unclear
- Use plain language with units and explicit status words
- Avoid hype, slang, and vague marketing claims
- Example: "Video is not clear enough for a reliable RPM call" is better than "Needs work"

# 16. Navigation
- Persistent top navigation with sport sections and settings
- Sport groups: Soccer, Baseball, Basketball
- Settings group: Profile, Privacy
- Keep the current sport context in URLs and headings
- Active context should be visible through color and label, not just proximity
- On smaller screens, collapse grouped navigation into stacked accordions or a compact menu so it does not wrap awkwardly

# 17. Page headers
- Page header pattern: eyebrow label, strong title, one supporting sentence, primary action on the right
- Keep titles specific to sport and task: "Baseball submissions", "Performance dashboard", "Parental approval flow"
- Use one primary CTA per page; put secondary actions in tertiary positions

# 18. Buttons
- Primary: filled brand primary, white text, rounded pill or medium radius
- Secondary: white surface, neutral border, dark text
- Tertiary: text button or subtle link
- Destructive: red filled or red outline with confirmation
- Sizes: 40–44px height minimum for tappable controls
- States: default, hover, active, focus, disabled, loading
- Do not mix multiple unrelated button styles on the same hierarchy level

# 19. Forms
- Labels above fields; helper text below labels
- Use full-width controls with consistent radius and border treatment
- Support file upload, range sliders, select menus, and date-time input clearly
- Inline validation and clear error text are required
- Required fields should be explicit; optional fields should not look required
- For minors, parent email and consent flows must be clearly explained
- After submit, show a success or queued state immediately

# 20. Tables and lists
- Use for admin monitoring, reports, and dense data views
- Keep row height comfortable and text readable
- Use zebra or subtle row separation only when needed
- Always label units and status
- On mobile, stack rows into cards instead of forcing horizontal scroll unless the view is admin-only

# 21. Cards and containers
- Default container: white, bordered, slightly rounded, subtle shadow
- Hero card: larger radius, clearer accent band, more breathing room
- Metrics card: compact, bold value, muted label
- Avoid stacking cards too close; the product should feel organized, not crowded

# 22. Status and feedback
- Status chips: queued, processing, completed, failed, open, in review, resolved, dismissed, granted, denied
- Use both color and text for meaning
- Surface processing attempts, upload progress, and benchmark percentiles explicitly
- For uncertainty, say what is unknown and why
- Show optimistic feedback only after the system has actually updated

# 23. Empty states
- Explain the missing data in one sentence
- Offer the next action immediately
- Examples: submit first drill, connect a profile, process the queue, upload a screenshot, review consent logs
- Empty states should feel useful, not apologetic

# 24. Loading and skeleton states
- Use skeleton cards for dashboards and lists
- Use progress bars for uploads and queue jobs
- Use loading text only where a skeleton is not practical
- Charts should have a non-blank fallback such as "No completed submissions yet"

# 25. Dialogs, drawers, and overlays
- Use confirmation dialogs for destructive actions like delete account or purge assets
- Drawers can house report details or admin review tools on desktop
- Preserve the underlying context whenever possible
- Keep overlay content scannable and short

# 26. Dashboards and data visualization
- KPI row first, trend chart second, supporting breakdowns third
- Keep chart legends visible and names specific
- Every chart needs a plain-language summary nearby
- Use consistent colors across pages: blue = metric, green = percentile/healthy, amber = caution/score
- Avoid 3D effects, noisy grids, or decorative chart gradients

# 27. Role-specific patterns
### Athlete
- fast upload path
- drill guidance near the form
- progress and queue feedback
- trends and completion status front and center

### Coach
- sport-specific drill library
- benchmark comparison
- drill frequency and score trends
- conservative analysis notes and references to clip quality

### Parent
- consent decision flow
- privacy and export tools
- clear explanation of what data is shared or anonymized

### Admin
- dense queue, logs, overrides, and model controls
- clear status language
- fast access to submissions and reports
- never bury the safety-critical tools

# 28. Responsive behavior
- Mobile: stack content, keep primary CTA visible, compress nav, preserve tap targets
- Tablet: cards and charts can share rows; keep forms single-column when complex
- Desktop: use multi-column dashboards and admin grids
- Preserve sport-specific context on every viewport
- Do not let long navigation labels or uppercase tags break layout

# 29. Accessibility
- Keyboard access for every interactive control
- Visible focus ring on all controls and links
- Minimum contrast should meet WCAG AA for text and controls
- Semantic buttons for actions; no clickable divs
- Announce upload progress and queue completion to assistive tech
- Do not rely on color alone for status
- Charts need accessible summaries or adjacent text equivalents
- Avoid tiny uppercase labels as the only descriptor for critical actions

# 30. Product-specific components
- Sport switcher with persistent query context
- Drill library cards with recording guidance and reference video links
- Upload form with sport-aware defaults, camera angle, clip quality, distance slider, and upload progress
- Submission card with status chip, metrics row, retry action, and expandable report form
- Dashboard KPI cards and trend chart module
- Benchmark snapshot card with percentile, cohort key, and anonymization indicator
- Admin processing runner and purge controls
- Model version activation and retraining control block
- Consent decision form
- Privacy export/delete actions
- Report submission and review forms

# 31. Marketing-site guidance, when applicable
- The home page can use a stronger hero and sports imagery, but it should still feel trustworthy
- Avoid generic startup claims or testimonials
- Keep sport segmentation visible from the first screen
- Marketing copy should promise clarity and control, not magic

# 32. Prohibited patterns
- Neon gradients or gaming visuals
- Childish mascots
- Empty “modern SaaS” styling
- Dense admin tables on mobile by default
- Hidden status states or ambiguous icons
- Overly rounded cards everywhere
- Generic navy enterprise styling with no brand distinction
- Hype language that overstates analysis certainty
- Destructive actions without confirmation

# 33. Implementation notes
- Preserve routes, data, permissions, and role gating
- Migrate tokens and shared primitives first
- Standardize button, input, card, status chip, and panel styles before redesigning pages
- Keep sport-aware query parameter behavior intact
- Improve focus styles and screen-reader announcements while touching forms
- Validate all major pages at mobile and desktop sizes before shipping
