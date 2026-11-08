"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import {
  applyDraft,
  CAMERA_ANGLE_OPTIONS,
  CLIP_QUALITY_OPTIONS,
  createInitialValues,
  describeUploadProgress,
  distanceToPostedFeet,
  getDistanceLabel,
  getDistanceUnit,
  getDrillsForSport,
  getOptionalFieldsForDrill,
  getSportsWithDrills,
  HANDEDNESS_OPTIONS,
  isDetailField,
  listUploadErrors,
  NOT_SURE_LABEL,
  parseUploadDraft,
  QUEUED_CONFIRMATION,
  resolveInitialSelection,
  toDatetimeLocalValue,
  UPLOAD_DRAFT_STORAGE_KEY,
  validateUploadValues,
  type FlowDrill,
  type UploadErrors,
  type UploadFieldKey,
  type UploadValues,
} from "@/app/submissions/new/upload-flow";
import { BrowserCameraRecorder } from "@/components/forms/browser-camera-recorder";
import { BASEBALL_LEAGUE_OPTIONS, SPORT_LABELS } from "@/lib/constants";

type UploadFormProps = {
  drills: FlowDrill[];
  initialSport?: string;
  initialDrillSlug?: string;
  userRole: string;
  monthlySubmissionLimit: number;
};

const CONTROL_CLASS = "athlemetry-control min-h-11 scroll-mb-28";
const INVALID_CLASS = "border-red-700!";

function fieldId(key: UploadFieldKey) {
  return `upload-field-${key}`;
}

function errorId(key: UploadFieldKey) {
  return `upload-error-${key}`;
}

function Field({
  label,
  required,
  help,
  helpId,
  error,
  errorKey,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  helpId?: string;
  error?: string;
  errorKey?: UploadFieldKey;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className="athlemetry-label">
        {label}
        {required ? <span className="ml-1.5 text-xs font-semibold text-slate-700">(required)</span> : null}
        {children}
      </label>
      {help ? (
        <p id={helpId} className="mt-1 text-xs leading-5 text-slate-600">
          {help}
        </p>
      ) : null}
      {error && errorKey ? (
        <p id={errorId(errorKey)} className="mt-1 text-sm font-semibold leading-5 text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

export function UploadForm({ drills, initialSport, initialDrillSlug, userRole, monthlySubmissionLimit }: UploadFormProps) {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [pending, setPending] = useState(false);
  const [cameraFile, setCameraFile] = useState<File | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [errors, setErrors] = useState<UploadErrors>({});
  const [hydrated, setHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLHeadingElement>(null);
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
  const optionalFields = getOptionalFieldsForDrill(selectedDrill);
  const distanceUnit = getDistanceUnit(selectedDrill);
  const errorList = listUploadErrors(errors);

  function clearError(key: UploadFieldKey) {
    setErrors((previous) => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }

  function setValue<K extends keyof UploadValues>(key: K, value: UploadValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
    clearError(key as UploadFieldKey);
  }

  /** Shared attributes that tie a control to its required marker and inline error. */
  function controlProps(key: UploadFieldKey, options: { helpId?: string; required?: boolean } = {}) {
    const describedBy = [options.helpId, errors[key] ? errorId(key) : undefined].filter(Boolean).join(" ");
    return {
      id: fieldId(key),
      "aria-required": options.required ? true : undefined,
      "aria-invalid": errors[key] ? true : undefined,
      "aria-describedby": describedBy || undefined,
    } as const;
  }

  function invalidClass(key: UploadFieldKey) {
    return errors[key] ? ` ${INVALID_CLASS}` : "";
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

  useEffect(() => {
    if (queued) confirmationRef.current?.focus();
  }, [queued]);

  function selectSport(sport: UploadValues["sport"]) {
    if (sport === values.sport) return;
    setValues((previous) => ({ ...previous, sport, drillId: "", distance: "", baseballLeague: "" }));
    setErrors({});
  }

  function selectDrill(drillId: string) {
    setValues((previous) => ({ ...previous, drillId, distance: "", baseballLeague: "" }));
    clearError("drillId");
  }

  function resetAfterSuccess() {
    setValues((previous) => ({
      ...createInitialValues(drills, { sport: previous.sport, drillId: previous.drillId }),
      recordingDate: toDatetimeLocalValue(new Date()),
    }));
    setCameraFile(null);
    setErrors({});
    setDetailsOpen(false);
  }

  function uploadAnother() {
    setQueued(false);
    setMessage(null);
    setProgress(0);
  }

  function focusField(key: UploadFieldKey) {
    if (isDetailField(key)) setDetailsOpen(true);
    window.setTimeout(() => document.getElementById(fieldId(key))?.focus(), 0);
  }

  function finishQueued() {
    setPending(false);
    setProgress(100);
    setQueued(true);
    resetAfterSuccess();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || queued) return;
    setMessage(null);

    const hasVideo = Boolean(cameraFile) || (fileInputRef.current?.files?.length ?? 0) > 0;
    const found = selectedDrill
      ? validateUploadValues(values, { hasVideo, unit: distanceUnit })
      : validateUploadValues({ ...values, drillId: "" }, { hasVideo, unit: distanceUnit });
    const firstInvalid = listUploadErrors(found)[0];
    if (firstInvalid || !selectedDrill) {
      setErrors(found);
      if (firstInvalid) {
        focusField(firstInvalid.key);
      }
      return;
    }
    setErrors({});

    setPending(true);
    setProgress(0);

    const formData = new FormData(event.currentTarget);

    formData.delete("sport");
    formData.set("drillDefinitionId", selectedDrill.id);
    formData.set("drillType", selectedDrill.slug);
    formData.set("location", values.location.trim());
    formData.set("baseballLeague", selectedDrill.sport === "baseball" ? values.baseballLeague : "");

    const postedFeet = distanceToPostedFeet(values.distance, distanceUnit);
    if (postedFeet !== null) formData.set("measurementDistanceFeet", String(postedFeet));
    else formData.delete("measurementDistanceFeet");

    // Untouched optional answers post nothing rather than an empty string.
    for (const key of ["cameraAngle", "athleteHandedness", "clipQuality", "baseballLeague"]) {
      const value = formData.get(key);
      if (typeof value === "string" && value === "") formData.delete(key);
    }

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
          if (!completeResponse.ok || !completed.ok) {
            setPending(false);
            setMessage(completed.error || "Cloud submission could not be finalized.");
            return;
          }
          finishQueued();
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

      try {
        const response = JSON.parse(request.responseText) as {
          ok?: boolean;
          error?: string;
          submissionId?: string;
          existingSubmissionId?: string;
        };

        if (request.status === 409 && response.existingSubmissionId) {
          setPending(false);
          setMessage("Duplicate upload detected. This video was already submitted within the last 24 hours.");
          return;
        }

        if (request.status >= 400 || !response.ok) {
          setPending(false);
          setMessage(response.error || "Upload failed.");
          return;
        }

        finishQueued();
      } catch {
        setPending(false);
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
  const progressText = describeUploadProgress(progress);
  const liveAnnouncement = queued
    ? "Your clip is uploaded. We're checking it now."
    : pending
      ? progressText.announcement
      : "";

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">{liveAnnouncement}</div>

      {queued ? (
        <div className="space-y-4 rounded-2xl bg-teal-50 p-5 md:p-6">
          <h2 ref={confirmationRef} tabIndex={-1} className="text-xl font-semibold tracking-tight text-slate-950 outline-none">
            {QUEUED_CONFIRMATION.heading}
          </h2>
          <p className="text-sm leading-6 text-slate-800">{QUEUED_CONFIRMATION.body}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/submissions" className="athlemetry-button athlemetry-button-primary min-h-11">
              View submission
            </Link>
            <button type="button" onClick={uploadAnother} className="athlemetry-button athlemetry-button-secondary min-h-11">
              Upload another clip
            </button>
          </div>
        </div>
      ) : (
    <form className="space-y-6" onSubmit={handleSubmit} noValidate>
      <fieldset>
        <legend className="text-base font-semibold text-slate-950">
          1. Choose a sport
          <span className="ml-1.5 text-xs font-semibold text-slate-700">(required)</span>
        </legend>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
          {sports.map((sport, index) => (
            <label key={sport} className="relative block">
              <input
                type="radio"
                name="sport"
                value={sport}
                checked={values.sport === sport}
                onChange={() => selectSport(sport)}
                className="peer sr-only"
                {...(index === 0 ? controlProps("sport", { required: true }) : {})}
              />
              <span className="flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border border-slate-300 bg-white px-2 text-center text-sm font-semibold text-slate-800 transition hover:border-teal-600 peer-checked:border-teal-700 peer-checked:bg-teal-100 peer-checked:font-bold peer-checked:text-teal-950 peer-checked:ring-2 peer-checked:ring-teal-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-slate-900">
                {SPORT_LABELS[sport]}
              </span>
              <CheckIcon className="pointer-events-none absolute right-2 top-2 hidden text-teal-800 peer-checked:block" />
            </label>
          ))}
        </div>
        {errors.sport ? (
          <p id={errorId("sport")} className="mt-2 text-sm font-semibold text-red-800">{errors.sport}</p>
        ) : null}
      </fieldset>

      {values.sport ? (
        <section className="space-y-3 border-t border-slate-200 pt-5" aria-labelledby="upload-step-drill">
          <h2 id="upload-step-drill" className="text-base font-semibold text-slate-950">
            2. Choose a drill
            <span className="ml-1.5 text-xs font-semibold text-slate-700">(required)</span>
          </h2>
          <label className="athlemetry-label">
            <span className="sr-only">Drill</span>
            <select
              name="drillDefinitionId"
              className={`${CONTROL_CLASS}${invalidClass("drillId")}`}
              value={values.drillId}
              onChange={(event) => selectDrill(event.target.value)}
              {...controlProps("drillId", { required: true })}
            >
              <option value="">Select a {SPORT_LABELS[values.sport].toLowerCase()} drill</option>
              {sportDrills.map((drill) => (
                <option key={drill.id} value={drill.id}>
                  {drill.name}
                </option>
              ))}
            </select>
          </label>
          {errors.drillId ? (
            <p id={errorId("drillId")} className="text-sm font-semibold text-red-800">{errors.drillId}</p>
          ) : null}

          {selectedDrill ? (
            <div className="space-y-4 rounded-2xl bg-teal-50 p-4">
              {selectedDrill.beforeYouFilm && selectedDrill.beforeYouFilm.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">Before you film</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-800">
                    {selectedDrill.beforeYouFilm.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div>
                <h3 className="text-sm font-semibold text-slate-950">How to record this drill</h3>
                <p className="mt-1 text-sm leading-6 text-slate-800">
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
                <span className="ml-1.5 text-xs font-semibold text-slate-700">(required, or record below)</span>
                <input
                  ref={fileInputRef}
                  name="video"
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                  className={`athlemetry-control scroll-mb-28 file:mr-3 file:min-h-9 file:cursor-pointer file:rounded-full file:border-0 file:bg-teal-50 file:px-4 file:py-1 file:text-sm file:font-semibold file:text-teal-900${invalidClass("video")}`}
                  onChange={() => clearError("video")}
                  {...controlProps("video", { helpId: "upload-help-video", required: !cameraFile })}
                />
              </label>
              <p id="upload-help-video" className="mt-1 text-xs leading-5 text-slate-600">MP4, MOV, WebM, or MKV.</p>
              {errors.video ? (
                <p id={errorId("video")} className="mt-1 text-sm font-semibold leading-5 text-red-800">{errors.video}</p>
              ) : null}
            </div>
            <div>
              <BrowserCameraRecorder
                onFileReady={(file) => {
                  setCameraFile(file);
                  clearError("video");
                }}
                disabled={pending}
              />
              {cameraFile ? (
                <p className="mt-2 text-xs leading-5 text-teal-900">
                  Your camera recording will be used instead of the file picker.
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Recording date" required error={errors.recordingDate} errorKey="recordingDate">
              <input
                type="datetime-local"
                name="recordingDate"
                className={`${CONTROL_CLASS}${invalidClass("recordingDate")}`}
                value={values.recordingDate}
                onChange={(event) => setValue("recordingDate", event.target.value)}
                {...controlProps("recordingDate", { required: true })}
              />
            </Field>
            <Field label="Location" required error={errors.location} errorKey="location">
              <input
                name="location"
                className={`${CONTROL_CLASS}${invalidClass("location")}`}
                placeholder="Field, cage, bullpen, gym, etc."
                value={values.location}
                onChange={(event) => setValue("location", event.target.value)}
                maxLength={80}
                autoComplete="off"
                {...controlProps("location", { required: true })}
              />
            </Field>
          </div>

          <details
            className="rounded-2xl border border-slate-200 bg-white/70"
            open={detailsOpen}
            onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
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
                  error={errors.frameRate}
                  errorKey="frameRate"
                >
                  <input
                    name="frameRate"
                    type="text"
                    inputMode="decimal"
                    className={`${CONTROL_CLASS}${invalidClass("frameRate")}`}
                    value={values.frameRate}
                    onChange={(event) => setValue("frameRate", event.target.value)}
                    {...controlProps("frameRate", { helpId: "upload-help-fps" })}
                  />
                </Field>
                <Field
                  label="Repetitions in the clip"
                  help="Only if you know how many reps the clip contains."
                  helpId="upload-help-reps"
                  error={errors.repetitionHint}
                  errorKey="repetitionHint"
                >
                  <input
                    name="repetitionHint"
                    type="text"
                    inputMode="numeric"
                    className={`${CONTROL_CLASS}${invalidClass("repetitionHint")}`}
                    placeholder={optionalFields.repetitionPlaceholder}
                    value={values.repetitionHint}
                    onChange={(event) => setValue("repetitionHint", event.target.value)}
                    {...controlProps("repetitionHint", { helpId: "upload-help-reps" })}
                  />
                </Field>
                <Field
                  label="Start frame"
                  help="Frame number where the drill begins. Only if you know it."
                  helpId="upload-help-start"
                  error={errors.startFrame}
                  errorKey="startFrame"
                >
                  <input
                    name="startFrame"
                    type="text"
                    inputMode="numeric"
                    className={`${CONTROL_CLASS}${invalidClass("startFrame")}`}
                    value={values.startFrame}
                    onChange={(event) => setValue("startFrame", event.target.value)}
                    {...controlProps("startFrame", { helpId: "upload-help-start" })}
                  />
                </Field>
                <Field
                  label="Finish frame"
                  help="Frame number where the drill ends; must be after the start frame. Only if you know it."
                  helpId="upload-help-finish"
                  error={errors.finishFrame}
                  errorKey="finishFrame"
                >
                  <input
                    name="finishFrame"
                    type="text"
                    inputMode="numeric"
                    className={`${CONTROL_CLASS}${invalidClass("finishFrame")}`}
                    value={values.finishFrame}
                    onChange={(event) => setValue("finishFrame", event.target.value)}
                    {...controlProps("finishFrame", { helpId: "upload-help-finish" })}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Camera angle">
                  <select
                    name="cameraAngle"
                    value={values.cameraAngle}
                    onChange={(event) => setValue("cameraAngle", event.target.value)}
                    className={CONTROL_CLASS}
                  >
                    <option value="">{NOT_SURE_LABEL}</option>
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
                    className={CONTROL_CLASS}
                  >
                    <option value="">{NOT_SURE_LABEL}</option>
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
                    className={CONTROL_CLASS}
                  >
                    <option value="">{NOT_SURE_LABEL}</option>
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
                      onChange={(event) => setValue("baseballLeague", event.target.value)}
                      className={CONTROL_CLASS}
                    >
                      <option value="">{NOT_SURE_LABEL}</option>
                      {BASEBALL_LEAGUE_OPTIONS.map((league) => (
                        <option key={league.key} value={league.key}>{league.label}</option>
                      ))}
                    </select>
                  </Field>
                ) : null}
              </div>

              {optionalFields.distance ? (
                <Field
                  label={getDistanceLabel(selectedDrill)}
                  help="Only if you measured it yourself. A typed distance is never used to confirm a result."
                  helpId="upload-help-distance"
                  error={errors.distance}
                  errorKey="distance"
                >
                  <span className="mt-2 flex items-center gap-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      className={`${CONTROL_CLASS} sm:max-w-40${invalidClass("distance")}`}
                      value={values.distance}
                      onChange={(event) => setValue("distance", event.target.value)}
                      {...controlProps("distance", { helpId: "upload-help-distance" })}
                    />
                    <span className="text-sm font-medium text-slate-800">{distanceUnit === "m" ? "metres" : "feet"}</span>
                  </span>
                </Field>
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
                    className={CONTROL_CLASS}
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

      <div className="space-y-2 text-sm leading-6 text-slate-700">
        <p>
          What happens next: we upload your clip, analyze it, and show you a result here. Once the upload finishes you can close this page.
        </p>
        <p>For some drills we can&apos;t yet confirm a measurement is accurate enough to show. If that happens, we tell you why.</p>
      </div>
      <div className="space-y-2 text-xs leading-5 text-slate-600">
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

      {pending || progress > 0 ? (
        <div>
          <div
            className="h-3 w-full overflow-hidden rounded-full bg-slate-300"
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="h-3 rounded-full bg-teal-700 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-900">{progressText.visible}</p>
        </div>
      ) : null}

      {message ? (
        <p className="rounded-2xl border border-red-300 bg-red-50 p-3 text-sm font-semibold leading-6 text-red-900" role="alert">
          {message}
        </p>
      ) : null}

      {errorList.length > 0 ? (
        <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm leading-6 text-red-950">
          <p className="font-semibold">
            {errorList.length === 1 ? "One thing needs fixing before you can submit:" : `${errorList.length} things need fixing before you can submit:`}
          </p>
          <ul className="mt-1 list-disc pl-5">
            {errorList.map(({ key, message: errorMessage }) => (
              <li key={key}>
                <a
                  href={`#${fieldId(key)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    focusField(key);
                  }}
                  className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
                >
                  {errorMessage}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pt-0">
        <button
          type="submit"
          disabled={pending}
          className="athlemetry-button athlemetry-button-primary min-h-11 w-full disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Uploading..." : "Upload clip"}
        </button>
      </div>
    </form>
      )}
    </>
  );
}
