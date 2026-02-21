# QA Error Report — athlemetry.vercel.app
Tested: 2026-02-20

---

## 1. Black text on black/dark buttons (UI)
**Pages affected:** Home hero button, `/drills` "Submit new drill" button, `/submissions` header button, navbar "Register" button (logged-out state)
Some action buttons use `bg-slate-900` (dark) with dark/black text, making the label invisible. Text should be white.

---

## 2. Registration form fields don't adapt to role (UX / Logic)
**Page:** `/register`
When the role dropdown is changed to COACH, PARENT, or ADMIN, athlete-specific fields (Age, Position, Competition Level, Team, Parent email) remain visible and are still required by the schema. These fields are irrelevant for coaches and parents and should be hidden/removed when a non-athlete role is selected. The schema also enforces `position` for all roles, meaning PARENT and COACH accounts cannot register without providing a soccer position.

---

## 3. Anyone can self-register as ADMIN — security vulnerability
**Page:** `/register` and `POST /api/auth/register`
The ADMIN role is present in `ROLE_OPTIONS` and is available in the registration dropdown. The `/api/auth/register` endpoint accepts `role: "ADMIN"` and returns a 200 OK, creating a fully privileged admin account. Anyone can gain admin access by self-registering. The Admin role should not be available in the registration form or API — admin accounts should only be created by the owner.
**Reproduce:** `POST /api/auth/register` with `{ role: "ADMIN", ... }` → returns `{ ok: true, user: { role: "ADMIN" } }`

---

## 4. All drill instruction video links go to Rick Astley
**Page:** `/drills`
All 5 "View instruction video" links point to `https://www.youtube.com/watch?v=dQw4w9WgXcQ` (Rick Astley - Never Gonna Give You Up). Each drill needs a correct YouTube link for its actual instruction video:
- 20-meter sprint
- 5-10-5 agility drill
- Cone dribble drill
- Shooting accuracy drill
- Shuttle endurance test

---

## 5. Drill submission always fails — datetime format mismatch (BLOCKER)
**Page:** `/submissions/new`
The "Recording date" field uses `<input type="datetime-local">` which produces values in the format `2026-02-20T10:00` (no seconds, no timezone). The server validates this field with `z.iso.datetime()` which requires a full ISO 8601 datetime with timezone offset (e.g. `2026-02-20T10:00:00.000Z`). Every submission attempt results in **"Invalid submission payload."** error even with valid data in all other fields.
**Fix:** Either convert the datetime-local value to full ISO format before sending (append `:00.000Z` or local offset), or relax the Zod validator to accept the datetime-local format using `z.iso.datetime({ offset: false, local: true })`.

---

## 6. Video upload crashes with 500 on Vercel — read-only filesystem (BLOCKER)
**Page:** `/submissions/new`, `POST /api/submissions`
The app defaults to `STORAGE_PROVIDER=local` which uses `LocalStorageProvider`. This tries to `mkdir` and write to `<cwd>/uploads/` (resolves to `/var/task/uploads/` on Vercel), which is a read-only filesystem. Every submission attempt that passes validation crashes with HTTP 500 "Submission failed."
**Confirmed in admin system error monitor:** `ENOENT: no such file or directory, mkdir '/var/task/uploads'`
**Fix:** Set `STORAGE_PROVIDER=s3` in Vercel environment variables and configure `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Alternatively, update `LocalStorageProvider` to use `/tmp` for serverless compatibility.

---

## 7. Active session not terminated after account deletion (Privacy / Compliance)
**Page:** `/privacy` → Delete account, `POST /api/privacy/delete`
When a user deletes their account, the soft-delete (`deletedAt` timestamp) is set and future logins are blocked. However, the currently active session cookie is **not invalidated**. The user remains logged in and can continue accessing all protected pages and APIs until the session naturally expires. For a privacy-compliance feature, the session should be immediately terminated on deletion (e.g. call `signOut()` server-side or invalidate the session token).

---

## 8. `passwordHash` included in data export (Security)
**Endpoint:** `POST /api/privacy/export`
The exported user data payload includes the `passwordHash` field. While it is a bcrypt hash (not plaintext), exporting it exposes the hash to the user and any downstream systems, enabling offline brute-force attacks. The `passwordHash` field should be excluded from the export response.
