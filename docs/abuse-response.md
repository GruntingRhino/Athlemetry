# Abuse-Response Runbook

## Scope and safety boundary

This runbook governs suspected abuse of Athlemetry accounts, feedback, sharing, team invitations, uploads, privacy requests, and administrator actions. It is an internal operating procedure, not a promise of automated detection, legal advice, emergency service, or a substitute for a production incident-response program.

Do not include passwords, session tokens, full videos, full report text, email addresses, phone numbers, database URLs, or other secrets in tickets, chat, or incident notes. Preserve only the minimum identifiers and timestamps needed for investigation. Follow the retention and erasure procedures in `docs/operations.md`.

## Severity and acknowledgement targets

| Severity | Examples | Initial action | Escalation target |
| --- | --- | --- | --- |
| P0 | Credible imminent harm, child-safety emergency, account takeover in progress, or confirmed large-scale disclosure | Preserve minimum facts, stop unsafe activity where an authorized control exists, and notify the incident owner immediately | Incident owner and appropriate emergency/legal channel; do not investigate through direct contact with a minor |
| P1 | Suspected unauthorized sharing, privacy/export/delete failure, repeated evasion of a safety control, or administrator-account misuse | Preserve minimum facts, restrict the affected workflow where authorized, and open an incident record | Security/privacy owner within one business day |
| P2 | Spam, prohibited contact information, abusive feedback, invite enumeration attempts, or suspected misuse without confirmed disclosure | Record the report, apply available rate-limit or account controls, and review the pattern | Operations owner within two business days |
| P3 | Product-quality complaint without a safety or privacy signal | Route through the normal feedback review workflow | Product/support owner |

The acknowledgement targets are internal operating goals, not an SLA. Escalate a case to the next severity whenever facts are uncertain or a minor, unauthorized disclosure, payment dispute, or active account compromise is involved.

## Intake and triage

1. Record an internal incident identifier, reporter channel, UTC discovery time, affected feature, severity, and a minimum set of opaque application IDs. Do not copy report reasons, private media, credentials, or contact information into the record unless legal/privacy counsel explicitly directs it.
2. Determine whether the case is P0/P1/P2/P3 using the table above. A suspected child-safety issue or active compromise is never handled as routine product support.
3. Check only authorized, role-scoped application records. Current product controls include report review, per-submission sharing, team invitation review, account deletion/export requests, and immutable `SECURITY_AUDIT`/workflow events. Do not use broad athlete discovery or profile browsing to investigate a report.
4. Confirm whether the behavior is ongoing. Record the smallest possible evidence: action type, opaque record ID, timestamp, authorization outcome, and relevant request status. Do not download or redistribute athlete video merely to create an incident note.
5. Assign an owner and next review time. If a required containment control does not exist in the product, state that limitation and escalate; do not improvise direct database changes or claim the account was contained.

## Containment and recovery

Use only controls that the assigned operator is authorized to use and that exist in the deployed product.

- **Feedback/report abuse:** preserve the report ID and audit timing; use the administrator report-status workflow for reviewed disposition. Do not treat a dismissal as an automatic deletion or a security ban.
- **Team invitation abuse:** retain the opaque invitation/team IDs and rate-limit outcome. The application rate limits invitation attempts; repeated or cross-account abuse requires operations escalation because account suspension and bulk invite revocation are not implemented controls.
- **Unauthorized submission sharing:** preserve the share/submission IDs and use the owner-scoped sharing revocation path when the owner is available and authorized. Verify the resulting access state through the scoped product response; do not expose recipient or owner details in the incident record.
- **Suspected account compromise:** require password reset/recovery through an approved support/security process. The repository has authenticated password change but does not provide self-service reset delivery; do not claim a reset email was sent or expose credentials.
- **Privacy/export/delete concern:** preserve the request ID and state, pause nonessential handling, and escalate to the privacy owner. Follow the existing export/delete and object-retention runbooks; no one may bypass erasure or retention safeguards to speed up investigation.
- **Upload/media concern:** do not reprocess, redistribute, or train on the media. Apply the configured retention/purge procedure and escalate if legal hold, custody, or external reporting is required.

After containment, verify only the specific state changed by the approved control. Record the verification timestamp, operator, and opaque resource ID. If no control exists, record `CONTAINMENT_UNAVAILABLE` and the escalation owner rather than treating the case as resolved.

## Communications and external escalation

1. Use approved support/privacy channels only. Do not ask minors to provide more personal information or contact them directly outside approved guardian and legal processes.
2. Acknowledge receipt without confirming unverified facts, naming another user, or promising an outcome. Share only status appropriate to the requester’s role and ownership.
3. Notify legal/privacy leadership before external disclosure, law-enforcement contact, regulator notification, or a breach determination. The application cannot determine legal notification duties.
4. For payment disputes, preserve the provider event/reference through the approved billing process and escalate to the commercial owner; do not alter entitlements manually without an authorized, audited workflow.

## Closure and retrospective

A case closes only when its assigned owner has documented the following:

- severity, UTC timeline, minimal opaque identifiers, and authorized investigator;
- containment action or an explicit `CONTAINMENT_UNAVAILABLE` escalation;
- scoped verification of the attempted containment or recovery state;
- requester communication status, without unrelated user data;
- required privacy/legal/security/commercial escalation decision; and
- a prevention follow-up with owner and due date when a product-control gap was found.

Retain the internal record only under the applicable retention policy. This runbook does not close the privacy, safety, moderation, guardian-verification, production-security, or legal-review blockers. It provides a repeatable, minimum-data response procedure until those controls and external evidence exist.
