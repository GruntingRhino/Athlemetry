# Athlemetry Repository Audit

## Product summary
Athlemetry is a production-oriented Next.js app for structured soccer, baseball, and basketball drill uploads, metric extraction, benchmark comparison, and longitudinal athlete tracking. The app also includes role-based admin tooling, consent workflows, privacy requests, and a public sports landing page. Evidence appears in `README.md`, `src/app/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/submissions/page.tsx`, `src/app/admin/page.tsx`, and `prisma/schema.prisma`.

## Route inventory
### User-facing pages
| Route | File | Purpose | Primary user |
|---|---|---|---|
| `/` | `src/app/page.tsx` | sports landing page and entry points | athletes, coaches, parents |
| `/login` | `src/app/login/page.tsx` | credentials sign-in | all roles |
| `/register` | `src/app/register/page.tsx` | self-registration with athlete/parent/coach roles | new users |
| `/dashboard` | `src/app/dashboard/page.tsx` | completed drill trends, score cards, charts | athletes, coaches |
| `/submissions` | `src/app/submissions/page.tsx` | submission archive, metrics, reports | athletes, admins |
| `/submissions/new` | `src/app/submissions/new/page.tsx` | upload and calibrate drill footage | athletes |
| `/benchmarking` | `src/app/benchmarking/page.tsx` | cohort percentiles and anonymized benchmarking | athletes, coaches |
| `/drills` | `src/app/drills/page.tsx` | drill library and recording guidance | athletes, coaches |
| `/profile` | `src/app/profile/page.tsx` | athlete metadata and cohort settings | athletes |
| `/privacy` | `src/app/privacy/page.tsx` | export/delete actions and consent logs | authenticated users |
| `/consent` | `src/app/consent/page.tsx` | parent/admin consent approval | parents, admins |
| `/admin` | `src/app/admin/page.tsx` | queue, manual override, model controls, logs | admins |
| `/admin/submissions` | `src/app/admin/submissions/page.tsx` | admin submission monitoring | admins |
| `/admin/reports` | `src/app/admin/reports/page.tsx` | report review | admins |

### Notable API routes
| Route | File | Purpose |
|---|---|---|
| `/api/submissions` | `src/app/api/submissions/route.ts` | create and list submissions |
| `/api/processing/run` | `src/app/api/processing/run/route.ts` | run processing queue |
| `/api/processing/status/[id]` | `src/app/api/processing/status/[id]/route.ts` | poll processing state |
| `/api/privacy/export` | `src/app/api/privacy/export/route.ts` | export personal data |
| `/api/privacy/delete` | `src/app/api/privacy/delete/route.ts` | delete account |
| `/api/consent/approve` | `src/app/api/consent/approve/route.ts` | record parental approval |
| `/api/admin/manual-override` | `src/app/api/admin/manual-override/route.ts` | manual metric or status override |
| `/api/admin/model/version` | `src/app/api/admin/model/version/route.ts` | activate a model version |
| `/api/admin/model/retrain` | `src/app/api/admin/model/retrain/route.ts` | queue retraining |
| `/api/admin/storage/purge-expired` | `src/app/api/admin/storage/purge-expired/route.ts` | purge temporary video assets |
| `/api/reports` | `src/app/api/reports/route.ts` | create user reports |
| `/api/admin/reports/[id]` | `src/app/api/admin/reports/[id]/route.ts` | review and update reports |
| `/api/v1/drills`, `/api/v1/submissions`, `/api/v1/benchmarks` | `src/app/api/v1/*` | integration endpoints |

## User-role model
Roles are defined in `prisma/schema.prisma` and `src/lib/authz.ts`:
- `ATHLETE`
- `PARENT`
- `COACH`
- `ADMIN`

## Audience inference
| Conclusion | Evidence | Interpretation | Confidence |
|---|---|---|---|
| Athletes are primary users | `src/app/submissions/new/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/profile/page.tsx`, `src/components/forms/upload-form.tsx` | core workflow is upload, review, improve | High |
| Coaches are key secondary users | `src/app/page.tsx`, `src/app/drills/page.tsx`, `src/app/dashboard/page.tsx`, coach-grade copy in `README.md` | coaches need drill guidance and performance review | High |
| Parents are external stakeholders | `src/app/consent/page.tsx`, `src/components/forms/register-form.tsx`, `src/app/privacy/page.tsx` | parents handle consent and trust/privacy concerns | High |
| Admins operate the system | `src/app/admin/page.tsx`, `src/app/admin/submissions/page.tsx`, `src/app/admin/reports/page.tsx` | queue management, overrides, reports, model controls | High |
| Economic buyer is likely an academy, club, school, or training org | role mix, consent flow, admin tooling, no pricing page in `README.md` | purchase is probably institutional or team-led, not pure self-serve | Medium |

## Evidence and confidence notes
- The app is explicitly multi-sport in `src/app/page.tsx` and `src/lib/constants.ts`.
- The upload form is calibrated to sport-specific angles and distances in `src/components/forms/upload-form.tsx` and `src/lib/drill-capture.ts`.
- Cohort benchmarking and anonymization are built into registration and profile flows in `src/components/forms/register-form.tsx`, `src/app/profile/page.tsx`, and `prisma/schema.prisma`.
- Parent consent and privacy actions are first-class flows in `src/app/consent/page.tsx` and `src/app/privacy/page.tsx`.

## Current design-system findings
### Preserve
- Light, calm, sports-professional visual tone from `src/app/globals.css` and the screenshots in `output/playwright/*.png`
- White cards with subtle borders and soft shadows in `src/app/dashboard/page.tsx`, `src/app/submissions/page.tsx`, `src/app/admin/page.tsx`
- Sport segmentation and query-param navigation in `src/components/layout/navigation.tsx` and `src/lib/sport-navigation.ts`
- Pill status chips and metric-focused cards across the dashboard and submission archive

### Refine
- Form control styling is inconsistent: some controls use `rounded-md`, others `rounded-2xl`; button treatments vary by page
- Navigation is dense and can wrap awkwardly on smaller screens (`src/components/layout/navigation.tsx`)
- Uppercase eyebrow labels and small gray metadata need stronger contrast and clearer semantics
- Charts need explicit accessibility summaries and keyboard-friendly alternatives

### Remove or minimize
- Hero-level decorative intensity on application pages
- Mixed accent usage without a strict semantic map
- Implicit color-only status communication
- Any “generic SaaS” styling that erases sport specificity

## Accessibility issues
- Many interactive elements have no explicit focus styling beyond default browser behavior.
- Several forms rely on placeholder text instead of durable helper text.
- Charts in `src/components/dashboard/*.tsx` are not self-describing to screen readers.
- Status meaning is sometimes conveyed primarily by color chips.
- Dense top navigation needs a mobile strategy to avoid overflow and repeated wrapping.
- Destructive actions (`src/components/forms/privacy-actions.tsx`) should have stronger confirmation affordances and clearer consequences.

## Reusable components
Strong candidates for design-system consolidation:
- `src/components/forms/upload-form.tsx`
- `src/components/forms/login-form.tsx`
- `src/components/forms/register-form.tsx`
- `src/components/forms/profile-form.tsx`
- `src/components/forms/consent-form.tsx`
- `src/components/forms/privacy-actions.tsx`
- `src/components/forms/processing-runner.tsx`
- `src/components/forms/manual-override-form.tsx`
- `src/components/forms/model-controls.tsx`
- `src/components/forms/report-form.tsx`
- `src/components/forms/report-review-form.tsx`
- `src/components/dashboard/performance-chart.tsx`
- `src/components/dashboard/frequency-chart.tsx`
- `src/components/layout/navigation.tsx`
- `src/components/layout/back-to-sports.tsx`

## Technical constraints
- Framework: Next.js 16 App Router + React 19 (`package.json`)
- Styling: Tailwind v4 with a small custom global layer (`src/app/globals.css`)
- Auth: NextAuth credentials + role checks (`src/lib/auth.ts`, `src/lib/authz.ts`)
- Data: Prisma + PostgreSQL (`prisma/schema.prisma`)
- Charts: Recharts (`src/components/dashboard/*.tsx`)
- Storage: local filesystem or S3-compatible object storage (`README.md`, `src/lib/storage.ts`)
- Current theme: light mode only; no evidence of a maintained dark theme
- The product must continue to support minors, consent, and privacy workflows

## Recommended migration order
1. Create shared design tokens for color, spacing, radius, shadows, typography, and focus states.
2. Standardize the app shell: navigation, page width, headers, and primary/secondary button styles.
3. Refactor the highest-frequency athlete workflow: drill upload, submissions archive, and dashboard.
4. Normalize drill library, benchmarking, and profile screens.
5. Bring admin surfaces into the same component language while keeping them denser.
6. Tighten consent and privacy flows with stronger confirmation, accessible feedback, and clearer copy.
7. Add accessibility summaries and responsive fallbacks for charts and dense tables.

## Screenshots reviewed
- `output/playwright/dashboard-after-submissions.png`
- `output/playwright/submissions-after-submissions.png`

Those screenshots show a light, spacious, white-card interface with dark navy text, subtle borders, teal/green accent actions, and a calm coach-grade tone.
