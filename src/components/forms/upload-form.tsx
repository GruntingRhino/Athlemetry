"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import {
  applyDraft,
  CAMERA_ANGLE_OPTIONS,
  CLIP_QUALITY_OPTIONS,
  createInitialValues,
  getDrillDefaults,
  getDrillsForSport,
  getOptionalFieldsForDrill,
  getSportsWithDrills,
  HANDEDNESS_OPTIONS,
  parseUploadDraft,
  resolveInitialSelection,
  toDatetimeLocalValue,
  UPLOAD_DRAFT_STORAGE_KEY,
  type FlowDrill,
  type UploadValues,
} from "@/app/submissions/new/upload-flow";
import { BrowserCameraRecorder } from "@/components/forms/browser-camera-recorder";
import { getDrillCaptureProfile } from "@/lib/drill-capture";
import { BASEBALL_LEAGUE_OPTIONS, SPORT_LABELS } from "@/lib/constants";

type UploadFormProps = {
  drills: FlowDrill[];
  initialSport?: string;
  initialDrillSlug?: string;
  userRole: string;
  monthlySubmissionLimit: number;
};

function Field({
  label,
  help,
  helpId,
  className,
  children,
}: {
  label: string;
  help?: string;
  helpId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className="athlemetry-label">
        {label}
        {children}
      </label>
      {help ? (
        <p id={helpId} className="mt-1 text-xs leading-5 text-slate-600">
          {help}
        </p>
      ) : null}
    </div>
  );
}

export function UploadForm({ drills, initialSport, initialDrillSlug, userRole, monthlySubmissionLimit }: UploadFormProps) {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [queuedSubmissionId, setQueuedSubmissionId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cameraFile, setCameraFile] = useState<File | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoredRef = useRef(false);

  const initialSelection = useMemo(
    () => resolveInitialSelection(drills, { sport: initialSport, drill: initialDrillSlug }),
    [drills, initialSport, initialDrillSlug],
  );
  const [values, setValues] = useState<UploadValues>(() => createInitialValues(drills, initialSelection));

  const sports = useMemo(() => getSportsWithDrills(drills), [drills]);
  const sportDrills = useMemo(() => getDrillsForSport(drills, values.sport), [drills, values.sport]);
  const selectedDrill = useMemo(
    () => sportDrills.find((drill) => drill.id === values.drillId),
    [sportDrills, values.drillId],
  );
  const captureProfile = useMemo(
    () => getDrillCaptureProfile(selectedDrill ? { slug: selectedDrill.slug, sport: selectedDrill.sport } : undefined),
    [selectedDrill],
  );
  const optionalFields = getOptionalFieldsForDrill(selectedDrill);

  function setValue<K extends keyof UploadValues>(key: K, value: UploadValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  // Restore an interrupted draft (never the video file) and default the date to now.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    let draft: UploadValues | null = null;
    try {
      draft = parseUploadDraft(window.sessionStorage.getItem(UPLOAD_DRAFT_STORAGE_KEY), drills);
    } catch {
      draft = null;
    }
    const initial = createInitialValues(drills, initialSelection);
    const restored = applyDraft(initial, draft);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after mount
    setValues({ ...restored, recordingDate: restored.recordingDate || toDatetimeLocalValue(new Date()) });
    setHydrated(true);
  }, [drills, initialSelection]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(UPLOAD_DRAFT_STORAGE_KEY, JSON.stringify(values));
    } catch {
      // Storage can be unavailable (private mode, blocked); the form still works.
    }
  }, [hydrated, values]);

  function selectSport(sport: UploadValues["sport"]) {
    if (sport === values.sport) return;
    const defaults = getDrillDefaults(undefined);
    setValues((previous) => ({ ...previous, sport, drillId: "", ...defaults }));
  }

  function selectDrill(drillId: string) {
    const drill = sportDrills.find((candidate) => candidate.id === drillId);
    const defaults = getDrillDefaults(drill);
    setValues((previous) => ({ ...previous, drillId, baseballLeague: "regulation-60-5", ...defaults }));
  }

  function resetAfterSuccess() {
    setValues((previous) => ({
      ...createInitialValues(drills, { sport: previous.sport, drillId: previous.drillId }),
      recordingDate: toDatetimeLocalValue(new Date()),
    }));
    setCameraFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setQueuedSubmissionId(null);

    if (!selectedDrill) {
      setMessage("Choose a sport and a drill before submitting.");
      return;
    }

    setPending(true);
    setProgress(0);

    const formData = new FormData(event.currentTarget);

    formData.delete("sport");
    formData.set("drillDefinitionId", selectedDrill.id);
    formData.set("drillType", selectedDrill.slug);
    formData.set("cameraAngle", values.cameraAngle);
    formData.set("measurementDistanceFeet", String(values.distanceFeet));
    formData.set("baseballLeague", selectedDrill.sport === "baseball" ? values.baseballLeague : "");

    if (cameraFile) {
      formData.set("video", cameraFile);
    }

    const recordingDate = formData.get("recordingDate");
    if (typeof recordingDate === "string" && recordingDate.length > 0) {
      const parsedRecordingDate = new Date(recordingDate);
      if (!Number.isNaN(parsedRecordingDate.getTime())) {
        formData.set("recordingDate", parsedRecordingDate.toISOString());
      }
    }

    const video = formData.get("video");
    if (video instanceof File) {
      try {
        const digest = await crypto.subtle.digest("SHA-256", await video.arrayBuffer());
        const videoHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        const presignResponse = await fetch("/api/uploads/presign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fileName: video.name,
            contentType: video.type,
            contentLength: video.size,
            sha256: videoHash,
          }),
        });

        if (presignResponse.ok) {
          const presign = await presignResponse.json() as { url: string; storageKey: string; uploadClaim: string };
          await new Promise<void>((resolve, reject) => {
            const upload = new XMLHttpRequest();
            upload.open("PUT", presign.url);
            upload.setRequestHeader("Content-Type", video.type);
            upload.upload.onprogress = (uploadEvent) => {
              if (uploadEvent.lengthComputable) setProgress(Math.round((uploadEvent.loaded / uploadEvent.total) * 100));
            };
            upload.onload = () => upload.status >= 200 && upload.status < 300 ? resolve() : reject(new Error("Cloud upload failed."));
            upload.onerror = () => reject(new Error("Network error during cloud upload."));
            upload.send(video);
          });

          const metadata = Object.fromEntries(
            [...formData.entries()].filter(([key, value]) => key !== "video" && typeof value === "string"),
          );
          const completeResponse = await fetch("/api/submissions/cloud", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              storageKey: presign.storageKey,
              fileName: video.name,
              fileSize: video.size,
              mimeType: video.type,
              videoHash,
              uploadClaim: presign.uploadClaim,
              metadata,
            }),
          });
          const completed = await completeResponse.json() as { ok?: boolean; error?: string; submissionId?: string; existingSubmissionId?: string };
          setPending(false);
          if (!completeResponse.ok || !completed.ok) {
            setMessage(completed.error || "Cloud submission could not be finalized.");
            return;
          }
          setMessage(`Submission queued: ${completed.submissionId}`);
          setQueuedSubmissionId(completed.submissionId ?? null);
          setProgress(100);
          resetAfterSuccess();
          return;
        }

        if (presignResponse.status !== 409) {
          const payload = await presignResponse.json().catch(() => ({})) as { error?: string };
          setPending(false);
          setMessage(payload.error || "Cloud upload could not be initialized.");
          return;
        }
      } catch (error) {
        setPending(false);
        setMessage(error instanceof Error ? error.message : "Cloud upload failed.");
        return;
      }
    }

    const request = new XMLHttpRequest();
    request.open("POST", "/api/submissions");

    request.upload.onprogress = (uploadEvent) => {
      if (uploadEvent.lengthComputable) {
        setProgress(Math.round((uploadEvent.loaded / uploadEvent.total) * 100));
      }
    };

    request.onreadystatechange = () => {
      if (request.readyState !== XMLHttpRequest.DONE) {
        return;
      }

      setPending(false);

      try {
        const response = JSON.parse(request.responseText) as {
          ok?: boolean;
          error?: string;
          submissionId?: string;
          existingSubmissionId?: string;
        };

        if (request.status === 409 && response.existingSubmissionId) {
          setMessage("Duplicate upload detected. This video was already submitted within the last 24 hours.");
          return;
        }

        if (request.status >= 400 || !response.ok) {
          setMessage(response.error || "Upload failed.");
          return;
        }

        setMessage(`Submission queued: ${response.submissionId}`);
        setQueuedSubmissionId(response.submissionId ?? null);
        setProgress(100);
        resetAfterSuccess();
      } catch {
        setMessage("Upload finished but response could not be parsed.");
      }
    };

    request.onerror = () => {
      setPending(false);
      setMessage("Network error during upload.");
    };

    request.send(formData);
  }

  if (sports.length === 0) {
    return <p className="text-sm text-slate-700">No drills are available yet.</p>;
  }

  const canChooseRetention = userRole === "COACH" || userRole === "ADMIN";

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <fieldset>
        <legend className="text-base font-semibold text-slate-950">1. Choose a sport</legend>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
          {sports.map((sport) => (
            <label key={sport} className="block">
              <input
                type="radio"
                name="sport"
                value={sport}
                checked={values.sport === sport}
                onChange={() => selectSport(sport)}
                className="peer sr-only"
              />
              <span className="flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border border-slate-300 bg-white px-2 text-center text-sm font-semibold text-slate-800 transition hover:border-teal-600 peer-checked:border-teal-700 peer-checked:bg-teal-50 peer-checked:text-teal-950 peer-checked:ring-2 peer-checked:ring-teal-700 peer-focus-visible:ring-4 peer-focus-visible:ring-teal-700/40">
                {SPORT_LABELS[sport]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {values.sport ? (
        <section className="space-y-3 border-t border-slate-200 pt-5" aria-labelledby="upload-step-drill">
          <h2 id="upload-step-drill" className="text-base font-semibold text-slate-950">2. Choose a drill</h2>
          <label className="athlemetry-label">
            <span className="sr-only">Drill</span>
            <select
              name="drillDefinitionId"
              className="athlemetry-control min-h-11"
              value={values.drillId}
              onChange={(event) => selectDrill(event.target.value)}
              required
            >
              <option value="">Select a {SPORT_LABELS[values.sport].toLowerCase()} drill</option>
              {sportDrills.map((drill) => (
                <option key={drill.id} value={drill.id}>
                  {drill.name}
                </option>
              ))}
            </select>
          </label>

          {selectedDrill ? (
            <div className="border-l-4 border-teal-600 pl-4">
              <p className="text-sm font-semibold text-slate-950">How to record this drill</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                {selectedDrill.guidelines ?? "Use the capture protocol for the cleanest upload."}
              </p>
              <Link
                href={`/protocols#${selectedDrill.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 underline underline-offset-4 hover:text-teal-950"
              >
                Full capture protocol (opens in a new tab)
              </Link>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="border-t border-slate-200 pt-5 text-sm text-slate-700">
          Choose a sport to pick a drill and add your video.
        </p>
      )}

      {selectedDrill ? (
        <section className="space-y-4 border-t border-slate-200 pt-5" aria-labelledby="upload-step-video">
          <h2 id="upload-step-video" className="text-base font-semibold text-slate-950">3. Add your video</h2>

          <div className="grid gap-4 md:grid-cols-2 md:items-start">
            <div>
              <label className="athlemetry-label">
                Choose a video file
                <input
                  ref={fileInputRef}
                  name="video"
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                  className="athlemetry-control file:mr-3 file:min-h-9 file:cursor-pointer file:rounded-full file:border-0 file:bg-teal-50 file:px-4 file:py-1 file:text-sm file:font-semibold file:text-teal-900"
                  required={!cameraFile}
                />
              </label>
              <p className="mt-1 text-xs leading-5 text-slate-600">MP4, MOV, WebM, or MKV.</p>
            </div>
            <div>
              <BrowserCameraRecorder onFileReady={(file) => setCameraFile(file)} disabled={pending} />
              {cameraFile ? (
                <p className="mt-2 text-xs leading-5 text-teal-900">
                  Your camera recording will be used instead of the file picker.
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Recording date">
              <input
                type="datetime-local"
                name="recordingDate"
                className="athlemetry-control min-h-11"
                value={values.recordingDate}
                onChange={(event) => setValue("recordingDate", event.target.value)}
                required
              />
            </Field>
            <Field label="Location">
              <input
                name="location"
                className="athlemetry-control min-h-11"
                placeholder="Field, cage, bullpen, gym, etc."
                value={values.location}
                onChange={(event) => setValue("location", event.target.value)}
                minLength={2}
                maxLength={80}
                required
              />
            </Field>
          </div>

          <details
            className="rounded-2xl border border-slate-200 bg-white/70"
            open={detailsOpen}
            onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
            onInvalidCapture={() => setDetailsOpen(true)}
          >
            <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold text-slate-900">
              Optional details (improves analysis)
            </summary>
            <div className="space-y-5 border-t border-slate-200 px-4 py-5">
              <p className="text-sm leading-6 text-slate-700">
                None of these are required. Fill in only what you know; blank fields are left out of the analysis.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Frame rate (frames per second)"
                  help="Only if you know it, for example 30 or 60. Leave blank if unsure."
                  helpId="upload-help-fps"
                >
                  <input
                    name="frameRate"
                    type="number"
                    inputMode="decimal"
                    min={10}
                    max={240}
                    step="any"
                    className="athlemetry-control min-h-11"
                    aria-describedby="upload-help-fps"
                    value={values.frameRate}
                    onChange={(event) => setValue("frameRate", event.target.value)}
                  />
                </Field>
                <Field
                  label="Repetitions in the clip"
                  help="Only if you know how many reps the clip contains."
                  helpId="upload-help-reps"
                >
                  <input
                    name="repetitionHint"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={500}
                    className="athlemetry-control min-h-11"
                    placeholder={optionalFields.repetitionPlaceholder}
                    aria-describedby="upload-help-reps"
                    value={values.repetitionHint}
                    onChange={(event) => setValue("repetitionHint", event.target.value)}
                  />
                </Field>
                <Field
                  label="Start frame"
                  help="Frame number where the drill begins. Only if you know it."
                  helpId="upload-help-start"
                >
                  <input
                    name="startFrame"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="athlemetry-control min-h-11"
                    aria-describedby="upload-help-start"
                    value={values.startFrame}
                    onChange={(event) => setValue("startFrame", event.target.value)}
                  />
                </Field>
                <Field
                  label="Finish frame"
                  help="Frame number where the drill ends; must be after the start frame. Only if you know it."
                  helpId="upload-help-finish"
                >
                  <input
                    name="finishFrame"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    className="athlemetry-control min-h-11"
                    aria-describedby="upload-help-finish"
                    value={values.finishFrame}
                    onChange={(event) => setValue("finishFrame", event.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Camera angle">
                  <select
                    name="cameraAngle"
                    value={values.cameraAngle}
                    onChange={(event) => setValue("cameraAngle", event.target.value)}
                    className="athlemetry-control min-h-11"
                  >
                    {CAMERA_ANGLE_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Athlete handedness">
                  <select
                    name="athleteHandedness"
                    value={values.athleteHandedness}
                    onChange={(event) => setValue("athleteHandedness", event.target.value)}
                    className="athlemetry-control min-h-11"
                  >
                    {HANDEDNESS_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Clip quality (your estimate)">
                  <select
                    name="clipQuality"
                    value={values.clipQuality}
                    onChange={(event) => setValue("clipQuality", event.target.value)}
                    className="athlemetry-control min-h-11"
                  >
                    {CLIP_QUALITY_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                {optionalFields.baseballLeague ? (
                  <Field label="Baseball league distance">
                    <select
                      name="baseballLeague"
                      value={values.baseballLeague}
                      onChange={(event) => {
                        const nextLeague = event.target.value;
                        const selectedLeague = BASEBALL_LEAGUE_OPTIONS.find((league) => league.key === nextLeague);
                        setValues((previous) => ({
                          ...previous,
                          baseballLeague: nextLeague,
                          distanceFeet: selectedLeague ? selectedLeague.distanceFeet : previous.distanceFeet,
                        }));
                      }}
                      className="athlemetry-control min-h-11"
                    >
                      {BASEBALL_LEAGUE_OPTIONS.map((league) => (
                        <option key={league.key} value={league.key}>{league.label}</option>
                      ))}
                    </select>
                  </Field>
                ) : null}
              </div>

              {optionalFields.distance ? (
                <div>
                  <label className="athlemetry-label">
                    {captureProfile.distanceLabel}
                    <input
                      type="range"
                      min={captureProfile.distanceMinFeet}
                      max={captureProfile.distanceMaxFeet}
                      step={captureProfile.distanceStep}
                      value={values.distanceFeet}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setValue("distanceFeet", Number.isFinite(next) ? next : captureProfile.measurementDistanceFeet);
                      }}
                      aria-describedby="upload-help-distance"
                      className="h-11 w-full accent-teal-700"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      name="measurementDistanceFeet"
                      type="number"
                      min={captureProfile.distanceMinFeet}
                      max={captureProfile.distanceMaxFeet}
                      step={captureProfile.distanceStep}
                      value={values.distanceFeet}
                      onChange={(event) => setValue("distanceFeet", Number(event.target.value || captureProfile.measurementDistanceFeet))}
                      aria-label={captureProfile.distanceLabel}
                      className="athlemetry-control min-h-11 w-28"
                    />
                    <span className="text-sm font-medium text-slate-800">ft</span>
                    <span className="text-xs text-slate-600">Default: {captureProfile.measurementDistanceFeet.toFixed(1)} ft</span>
                  </div>
                  <p id="upload-help-distance" className="mt-2 text-xs leading-5 text-slate-600">
                    {captureProfile.distanceHelp}
                  </p>
                </div>
              ) : null}

              <Field label="Notes for analysis">
                <textarea
                  name="notes"
                  rows={3}
                  maxLength={500}
                  className="athlemetry-control"
                  placeholder="Windy day, second attempt"
                  value={values.notes}
                  onChange={(event) => setValue("notes", event.target.value)}
                />
              </Field>

              {canChooseRetention ? (
                <Field label="Video review retention">
                  <select
                    name="reviewRetentionDays"
                    value={values.reviewRetentionDays}
                    onChange={(event) => setValue("reviewRetentionDays", event.target.value)}
                    className="athlemetry-control min-h-11"
                  >
                    <option value="0">Default — remove after analysis</option>
                    <option value="7">Keep for 7 days</option>
                    <option value="30">Keep for 30 days</option>
                    <option value="90">Keep for 90 days</option>
                  </select>
                </Field>
              ) : null}
            </div>
          </details>

          {canChooseRetention ? null : <input type="hidden" name="reviewRetentionDays" value="0" />}
        </section>
      ) : null}

      {(pending || progress > 0) ? (
        <div>
          <div className="h-2 w-full rounded-full bg-slate-200">
            <div className="h-2 rounded-full bg-teal-700 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-600">Upload progress: {progress}%</p>
        </div>
      ) : null}

      {message ? (
        <p className="athlemetry-message" role="status">
          {message}
          {queuedSubmissionId ? (
            <>
              {" "}
              <Link
                href={`/submissions${values.sport ? `?sport=${values.sport}` : ""}`}
                className="underline underline-offset-4"
              >
                View submissions
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="border-t border-slate-200 pt-5">
        <button
          type="submit"
          disabled={pending || !selectedDrill}
          className="athlemetry-button athlemetry-button-primary w-full disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Uploading..." : "Submit drill"}
        </button>
        {!selectedDrill ? (
          <p className="mt-3 text-sm text-slate-700">Choose a sport and a drill to enable submitting.</p>
        ) : null}
        <div className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
          <p>
            What happens next: we upload your clip, analyze it, and show you a result here. Once the upload finishes you can close this page.
          </p>
          <p>Some drills are still in research mode: you&apos;ll see why if a result is held back.</p>
        </div>
        <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
          <p>
            <strong className="font-semibold text-slate-800">Video retention:</strong>{" "}
            Your video is deleted after successful analysis by default. Only extracted metrics and analysis metadata are retained.
          </p>
          {userRole !== "ADMIN" ? (
            <p>
              Your membership includes up to {monthlySubmissionLimit} completed submissions per UTC calendar month. Uploads beyond that allowance are not processed.
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
