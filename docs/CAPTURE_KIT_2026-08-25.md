# PREPARATION — Recording Capture Kit (2026-08-25)

Status: PREPARATION for day-3 real-athlete recording sessions. Derived programmatically from `src/lib/drill-protocols.ts` @210bc44 (protocol version 1.1.0) and `docs/professional-cv-validation-plan.md`. No synthetic media counts as validation data; this kit is for real, consent-cleared captures only.

## 1. Universal phone settings checklist (verify before every session)

- [ ] **60 fps minimum** preferred for every drill (protocol `minimumFps`); **120 fps mandatory** for baseball pitch velocity and baseball swing timing.
- [ ] **1080p or higher** resolution. Prefer rear camera, main lens.
- [ ] **Lock exposure and focus** on the athlete before recording (tap-and-hold AE/AF lock). Re-lock after any camera move.
- [ ] **No digital zoom** ever. Move the tripod closer/wider instead.
- [ ] **Fixed camera on tripod** unless the drill explicitly allows otherwise. No panning, no following the athlete.
- [ ] Landscape orientation, clean lens, ≥50% battery, enough storage for the session.
- [ ] Record a 3–5 s still check at each new position confirming every required reference (see tables) is fully visible with complete borders, not cropped or blurred.
- [ ] Confirm exported clip frame rate/resolution in file properties before upload (some phones export slo-mo at reduced fps).

## 2. Per-sport shot lists

Every active drill × accepted angles × duration × framing. All drills require: full body in frame, stationary start evidence, and the listed reference objects continuously visible. Durations are per attempt; record the stated number of valid attempts plus invalid/off-protocol variants where safe (stratification requires them).

### Soccer (9 drills)

| Drill | Accepted angles | Min fps | Attempts | Per-attempt duration | Framing / references that must stay visible |
|---|---|---|---|---|---|
| sprint-20m | side, diagonal | 60 | 3 trials (≥3 min rest) | ~6 s + run-through | Full 20 m lane in ONE stationary shot; both complete ArUco marker borders (IDs 0 & 1); runner accelerates through finish |
| agility-5-10-5 | side, diagonal, overhead | 60 | 3 per direction (L-first, R-first) | ~8 s | All three measured touch lines (flat high-contrast lines, NOT cones); full body |
| shooting-accuracy | behind-goal, diagonal | 60 | 10 shots | ~10 s incl. target call | Goal frame, numbered 6-zone target grid, fixed 11 m shooting mark; state/show intended zone before each shot |
| shooting-mechanics | diagonal, side | 60 | 10 strikes | ~8 s | Ball, plant-marker cone, full body, goal frame, target grid — plant through first strike; NO make/miss result |
| movement-efficiency | diagonal, overhead | 60 | 3 route attempts | ~10 s | Complete measured 6 m route, all four cones, numbered finish target, full body |
| passing-accuracy | side, diagonal | 60 | 10 passes | ~8 s | Marked start line, full 10 m lane, numbered ground-pass target |
| first-touch-control | diagonal, side | 60 | 10 receptions | ~8 s | Measured 5 m service line, both control-square cones, numbered target inside 2 m square |
| cone-dribble | side, diagonal, overhead | 60 | 3 valid reps | ~10 s | Full cone route (six cones @2 m), start/finish lines 1 m beyond end cones |
| shuttle-endurance | side, diagonal | 30 | until test terminates | full stage (~1–3 min) | Both measured shuttle lines in same frame; official shuttle audio audible/synced |

### Baseball (4 drills)

| Drill | Accepted angles | Min fps | Attempts | Per-attempt duration | Framing / references |
|---|---|---|---|---|---|
| pitch-velocity | behind-catcher, open-side | **120** | 10 fastballs | ~5 s per pitch + set | Rubber, plate, full measured pitch span; radar/tracking running |
| pitch-command | behind-catcher, behind-pitcher | 60 | 27 (3 × 9 zones) | ~6 s | Complete nine-zone strike target centered; show/state intended zone before delivery |
| throwing-mechanics | open-side, diagonal | 60 | 10 throws | ~6 s | Ball, full body, home-plate marker, numbered target; no outcome recorded |
| swing-timing | open-side, side | **120** | 10 swings | ~5 s | Whole bat + calibrated length reference plane through contact; marked stance/bat box |

### Basketball (4 drills)

| Drill | Accepted angles | Min fps | Attempts | Per-attempt duration | Framing / references |
|---|---|---|---|---|---|
| spot-shooting | diagonal | 60 | 5 shots × 5 spots | ~10 s per spot clip | Marked spot, court lines, hoop, backboard, ball, athlete; one stationary framing per spot (no panning between spots) |
| lane-agility | diagonal | 60 | 3 attempts | ~15 s | Complete regulation 47 ft lane route, all turn/start/finish lines, full body |
| free-throw | diagonal | 60 | 10 shots | ~8 s | Measured 15 ft free-throw line, rim, backboard, full body through first rim outcome |
| form-capture | side, diagonal, open-side | 60 | 20 free throws | ~8 s | Free-throw line, rim, backboard; hold follow-through until ball reaches rim |

Note: every protocol prepends a planar-marker calibration setup requirement (`PLANAR_MARKER_SETUP`, IDs 10–13 on surveyed coplanar control points). For day-3 field sessions this applies to any capture you intend to use for planar-calibration capability validation; plain drill recordings do not block on it, but record it when feasible.

## 3. ArUco print-and-place instructions — 20 m sprint protocol v1.1.0

1. **Print** ArUco dictionary markers **ID 0** and **ID 1**, one per A4/Letter sheet, marker filling most of the page (≥15 cm printed side), thick black border intact, matte paper (no gloss glare).
2. **Measure the lane**: lay out a straight **20.00 m** lane with a calibrated steel tape on a non-slip level surface. Tape measurement is the physical truth; markers never establish distance.
3. **Place ID 0** center exactly on the measured start line; **place ID 1** center exactly on the measured finish line. Tape them flat to the ground, fully face-up, no wrinkles/curl.
4. **Camera**: fixed on tripod, side or diagonal, wide enough that **both complete marker borders** are visible simultaneously for at least four analyzed frames. Run a still-frame check before the first trial; if a border is cropped or blurred, move the camera back and re-check.
5. Do not pan or track the runner; the whole lane stays in one stationary shot.
6. Record three trials, ≥3 min rest, stationary two-point start, audible cue synced to timing gates, sprint *through* the finish marker.
7. Photograph the taped lane + steel tape reading for the calibration evidence record.

## 4. Lighting & background guidance (per stratification matrix)

The corpus must stratify across indoor/outdoor lighting and high/low contrast uniforms, so plan sessions to hit multiple cells:

- **Outdoors bright sun**: avoid harsh midday shadows across the lane; sun behind or beside camera, not into lens. Uniform vs background should differ (light uniform/dark background or vice versa).
- **Overcast outdoor**: easiest even lighting — good default for sprint/agility lanes.
- **Indoor gym**: ensure even overhead lighting; avoid backlighting from windows behind the athlete; check exposure-lock doesn't blow out the floor lines.
- **Low-light / dusk**: capture some clips deliberately, but verify marker borders and court lines remain readable in a still frame.
- **Backgrounds**: include both cluttered (bystanders, equipment, matching uniforms — needed for occlusion/re-id stratification) and clean backgrounds across the corpus. Never let required reference objects blend invisibly into the background.
- Per stratification also vary: camera distances, ≥5 phone models across the corpus, orientations, single athlete vs bystanders, partial/long occlusion and re-entry, and invalid/incomplete/extra-rep/wrong-drill/off-protocol attempts.

## 5. Filename convention

```
<date>_<sport>_<drill>_<angle>_<attempt>_<athleteAlias>.mp4
```

- `date` = YYYYMMDD (e.g. `20260828`)
- `drill` = exact slug from `drill-protocols.ts` (e.g. `sprint-20m`, `baseball-pitch-velocity`)
- `angle` = one of the drill's accepted angles, hyphenated as in protocol (`behind-goal`, `open-side`, …)
- `attempt` = zero-padded `a01`, `a02`, … within that drill+angle+athlete
- `athleteAlias` = pseudonymous alias only (never legal names) — e.g. `20260828_soccer_sprint-20m_side_a01_falcon.mp4`
- Invalid/off-protocol takes: append suffix `_invalid` or `_offprotocol` instead of deleting — they are required stratification cells.
- Companion files (annotation JSON, release scans, calibration photos) keep the same stem with suffixes `_ann.json`, `_release.pdf`, `_calib.jpg`.

## 6. Ingest check — verified against source @210bc44

Verified by direct read of `src/lib/constants.ts` and `src/app/api/uploads/presign/route.ts`:

- `ALLOWED_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"]` → planned **H.264 MP4 is accepted** (`video/mp4`). ✅
- `MAX_VIDEO_SIZE_MB` defaults to **200** (env-overridable) → a 1080p60 H.264 clip of these per-attempt durations (seconds-to-minutes) lands well under 200 MB; a full multi-minute shuttle stage may approach it — if so, trim to the attempt or split files rather than raising the limit unilaterally. ✅
- Presign flow requirements per request body: authenticated adult-or-parental-consent user, active subscription, `fileName` ≤255 chars, allowed `contentType`, `contentLength` ∈ (0, MAX], and lowercase 64-hex `sha256` of the file.

**Bulk upload approach (existing presign flow only, no new tooling):**

1. Compute SHA-256 of each mp4 locally; rename to the §5 convention first.
2. For each file, `POST /api/uploads/presign` with `{ fileName, contentType: "video/mp4", contentLength, sha256 }`; receive presigned URL + uploadClaim.
3. Upload bytes directly to storage via the presigned URL (standard HTTP PUT — curl or the app's own upload UI both work).
4. Repeat sequentially per file; keep the request/response log alongside the labeling folder so each stored object maps back to its local filename and manifest entry.
5. Files >200 MB are rejected client-side by validators — split before requesting presigns.

Do not introduce third-party bulk-uploaders; sequential presign calls over ~40–90 clips are entirely manageable.
