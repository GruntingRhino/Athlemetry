# Phase 1 Checklist

## Auth
- [ ] User registration form renders and submits successfully
- [ ] Secure login issues session token or JWT on success
- [ ] Profile creation form captures age, position, team, and skill level
- [ ] Role field stored and readable (athlete / parent / coach)
- [ ] Auth-gated routes redirect unauthenticated users to login
- [ ] Account deletion removes user record and active session data

## Uploads
- [ ] Drill library page lists all predefined drills with name and description
- [ ] Drill recording guidelines displayed per drill detail page

## Dashboards
- [ ] Dashboard shell renders with role-appropriate navigation (athlete / parent / coach)
- [ ] Empty-state drill history page renders without errors for a new account

## Infrastructure
- [ ] Database schema created: users, profiles, drills, drill_submissions, metrics tables
- [ ] Environment variables validated at startup; app refuses to boot if required vars are missing
- [ ] CI pipeline runs lint and type checks on every pull request
- [ ] App deploys successfully to staging environment with zero manual steps
- [ ] Health-check endpoint returns HTTP 200 with service status payload
