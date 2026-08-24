# Athlemetry OpenDesign generation prompt

Inspect the repository first, then apply the design system without changing product logic.

Goals:
- Preserve every route, role, integration, and data flow.
- Keep sport-specific workflows intact.
- Migrate design tokens first.
- Standardize the global shell and navigation next.
- Consolidate reusable primitives before page-level redesign.
- Refactor the highest-frequency workflows before edge cases.
- Improve accessibility and keyboard behavior everywhere you touch.
- Validate responsive behavior on mobile, tablet, and desktop.
- Finish with a consistency audit across athlete, coach, parent, and admin surfaces.

Do not:
- invent new product features
- remove consent or privacy flows
- hide uncertainty in analysis output
- replace sport segmentation with generic SaaS layouts
- alter permissions, API contracts, or database semantics
- over-style admin views so they lose readability

Design intent:
- credible, coach-grade, premium, and structured
- light surfaces, dark navy text, teal/emerald actions, restrained blue/amber metrics
- real data first, decorative polish second
- clear status language and explicit error states

Implementation order:
1. tokens and shared primitives
2. app shell, navigation, buttons, inputs, chips, cards
3. upload and submissions flows
4. dashboard, benchmarking, and drill library
5. profile, privacy, and consent flows
6. admin monitoring, overrides, logs, and model controls
7. final accessibility and responsive review
