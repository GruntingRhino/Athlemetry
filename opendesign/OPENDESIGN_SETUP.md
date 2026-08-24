# OpenDesign setup for Athlemetry

1. Repository URL to enter
- Use the Athlemetry repository URL you want OpenDesign to analyze.
- If your OpenDesign workflow supports local import instead of a remote URL, use the local repo path: `/Users/abhay/RTB/athlemetry`.

2. Deployed URL
- If you have a staging or production URL, include it as supplemental material.
- It is helpful but not required; the repository itself already contains enough evidence for the system.

3. Screenshots or assets to upload
- Upload the current logo or wordmark if available.
- Upload a home / landing screenshot.
- Upload a dashboard screenshot.
- Upload a submissions screenshot.
- Upload a drill upload screen screenshot.
- Upload an admin screen screenshot.
- Upload one mobile screenshot if possible.
- Upload any approved brand imagery that is safe to share.

4. What to paste into “Describe brand”
- Paste the contents of `opendesign/BRAND_DESCRIPTION.txt` exactly as written.

5. What to paste into “Paste DESIGN.md”
- Paste the contents of `opendesign/DESIGN.md` exactly as written.

6. What not to upload
- Do not upload `.env`, `.env.local`, database dumps, or secrets.
- Do not upload private athlete videos unless they are explicitly approved for sharing.
- Do not upload unredacted personal data, consent records, or internal admin credentials.
- Do not upload raw backend logs that contain sensitive identifiers.

7. Privacy / proprietary warnings
- Athlemetry handles minors, consent, and privacy requests, so shared assets should be minimized and scrubbed.
- Benchmarks and reports may expose sensitive athlete information; use only approved screenshots and mock data.

8. Recommended generation order
- Step 1: enter the repository URL or local source.
- Step 2: upload screenshots and approved assets.
- Step 3: paste the brand description.
- Step 4: paste `DESIGN.md`.
- Step 5: generate the system.
- Step 6: review the output against the audit in `REPO_AUDIT.md`.
- Step 7: iterate only on missing states, spacing, accessibility, or brand mismatches.
