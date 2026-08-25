# PREPARATION — Athlete Release Template (DRAFT)

> **⚠️ DRAFT — REQUIRES LEGAL REVIEW BEFORE ANY SIGNATURE IS COLLECTED.**
> This template has not been reviewed by counsel and must not be used as-is for actual releases. Jurisdiction-specific requirements (minor consent law, data-protection regulation, witness/notarization) are not addressed here.

---

## Athlete Footage Release (Training & Internal Model Validation)

Date: ____________   Location of recording: ____________________

Athlete name: ____________________   Pseudonymous alias for records: ____________________

Date of birth (to determine adult/minor status): ____________

### 1. What I am agreeing to

I permit Athlemetry ("the Company") to record video and audio of me performing athletic drills on the date(s) listed above, and to use those recordings **only for**:

- my own athletic training feedback within the Athlemetry product;
- internal development and validation of the Company's computer-vision models.

### 2. No public identification

My recordings will **not** be published, posted publicly, sold, licensed to third parties, or used for marketing. My identity will be replaced with a pseudonymous alias in internal records wherever possible.

### 3. Voluntary participation & revocation

Participation is voluntary. I may **revoke this release at any time** by written notice to the Company. Upon revocation, my recordings will be removed from future model training and validation datasets within 30 days and will not appear in any new dataset build. Revocation does not require stated reason.

### 4. Retention

Recordings covered by this release are retained only while they remain part of an active training/validation dataset, consistent with the Company's data-retention schedule, and in any case are deleted upon revocation or upon dataset retirement, whichever comes first.

### 5. Health & safety

I confirm I am physically able to perform the drills and will perform them under appropriate supervision with adequate rest intervals.

---

Athlete signature: ____________________ (if 18+)   Date: ________

---

## Guardian Consent Addendum (required for minors)

> Same DRAFT — REQUIRES LEGAL REVIEW notice applies.

I am the parent/legal guardian of the minor athlete named above. I have read the Athlete Release above and:

- consent to the recording and internal use described in §1;
- understand the no-public-identification commitment in §2;
- understand I may revoke this consent under §3 at any time by written notice, with deletion within 30 days;
- understand the retention terms in §4.

Guardian name: ____________________   Relationship: ____________________
Guardian signature: ____________________   Date: ________
Guardian contact (email/phone): ____________________

Witness (optional but recommended): ____________________

---

### Internal filing notes (not part of the signed document)

- Scan the signed release to PDF named `<alias>_release.pdf` (and `<alias>_guardian-release.pdf` for minors).
- The validation manifest requires `participantRelease.status = "SIGNED"`, `ageCategory` = `adult|minor`, HTTPS `releaseUri`, and `guardianReleaseUri` for minors (see `vision_core/validation_manifest.py`). A clip without a SIGNED release on file must not enter the corpus.
- Target: ≥30 consent-cleared clips per launch sport (soccer/baseball/basketball).
