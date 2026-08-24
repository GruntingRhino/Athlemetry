"use client";

import { useMemo, useState, type FormEvent } from "react";

import { BrowserCameraRecorder } from "@/components/forms/browser-camera-recorder";
import { getDrillCaptureProfile } from "@/lib/drill-capture";
import { BASEBALL_LEAGUE_OPTIONS, SPORT_LABELS } from "@/lib/constants";

type Drill = {
  id: string;
  name: string;
  slug: string;
  sport: string;
  guidelines?: string;
};

type UploadFormProps = {
  drills: Drill[];
  initialSelectedDrillId?: string;
  userRole: string;
  monthlySubmissionLimit: number;
};

const CAMERA_ANGLE_OPTIONS = [
  ["side", "Side view"],
  ["open-side", "Open-side / athlete-side"],
  ["diagonal", "Diagonal / game angle"],
  ["behind-goal", "Behind goal / endline"],
  ["behind-pitcher", "Behind pitcher"],
  ["behind-catcher", "Behind catcher / center field"],
  ["front-on", "Front-on"],
  ["overhead", "Overhead"],
  ["unknown", "Not sure"],
] as const;

const HANDEDNESS_OPTIONS = [
  ["right", "Right"],
  ["left", "Left"],
  ["switch", "Switch"],
  ["unknown", "Not sure"],
] as const;

const CLIP_QUALITY_OPTIONS = [
  ["excellent", "Excellent"],
  ["good", "Good"],
  ["fair", "Fair"],
  ["poor", "Poor / blurry"],
] as const;

export function UploadForm({ drills, initialSelectedDrillId, userRole, monthlySubmissionLimit }: UploadFormProps) {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [selectedDrillId, setSelectedDrillId] = useState<string>(
    drills.some((drill) => drill.id === initialSelectedDrillId) ? initialSelectedDrillId! : drills[0]?.id ?? "",
  );
  const [baseballLeague, setBaseballLeague] = useState("regulation-60-5");
  const [cameraFile, setCameraFile] = useState<File | null>(null);

  const defaultDrill = useMemo(() => drills[0], [drills]);
  const selectedDrill = useMemo(
    () => drills.find((drill) => drill.id === selectedDrillId) ?? defaultDrill,
    [drills, defaultDrill, selectedDrillId],
  );
  const captureProfile = useMemo(
    () => getDrillCaptureProfile(selectedDrill ? { slug: selectedDrill.slug, sport: selectedDrill.sport } : undefined, baseballLeague),
    [baseballLeague, selectedDrill],
  );
  const defaultCaptureProfile = useMemo(
    () => getDrillCaptureProfile(defaultDrill ? { slug: defaultDrill.slug, sport: defaultDrill.sport } : undefined),
    [defaultDrill],
  );
  const [cameraAngle, setCameraAngle] = useState(captureProfile.cameraAngle);
  const [distanceFeet, setDistanceFeet] = useState(captureProfile.measurementDistanceFeet);

  const groupedDrills = useMemo(() => {
    const groups = new Map<string, Drill[]>();
    for (const drill of drills) {
      const current = groups.get(drill.sport) ?? [];
      current.push(drill);
      groups.set(drill.sport, current);
    }
    return Array.from(groups.entries());
  }, [drills]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setPending(true);
    setProgress(0);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const selected = drills.find((drill) => drill.id === formData.get("drillDefinitionId"));
    formData.set("drillType", selected?.slug || "sprint-20m");
    formData.set("cameraAngle", cameraAngle);
    formData.set("measurementDistanceFeet", String(distanceFeet));
    formData.set("baseballLeague", selected?.sport === "baseball" ? baseballLeague : "");

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
          setProgress(100);
          form.reset();
          setSelectedDrillId(defaultDrill?.id ?? "");
          setCameraAngle(defaultCaptureProfile.cameraAngle);
          setDistanceFeet(defaultCaptureProfile.measurementDistanceFeet);
          setCameraFile(null);
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
        setProgress(100);
        form.reset();
        setSelectedDrillId(defaultDrill?.id ?? "");
        setCameraAngle(defaultCaptureProfile.cameraAngle);
        setDistanceFeet(defaultCaptureProfile.measurementDistanceFeet);
        setCameraFile(null);
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

  if (!defaultDrill) {
    return <p className="text-sm text-slate-600">No drills are available yet.</p>;
  }

  const isBaseball = selectedDrill?.sport === "baseball";
  const isBasketball = selectedDrill?.sport === "basketball";
  const isSoccer = selectedDrill?.sport === "soccer";

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="athlemetry-card-soft p-5 text-sm text-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <span className="athlemetry-chip border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-teal-800">
            {SPORT_LABELS[(selectedDrill?.sport as keyof typeof SPORT_LABELS) ?? "soccer"] ?? "Sport"}
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            Upload guidance
          </span>
        </div>
        <h3 className="mt-3 text-lg font-semibold text-slate-900">{selectedDrill?.name ?? defaultDrill.name}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-700">{selectedDrill?.guidelines ?? "Use the drill instructions below for the cleanest upload."}</p>
        <p className="mt-3 text-sm font-semibold text-teal-900">{captureProfile.distanceHelp}</p>
        {isBaseball ? (
          <p className="mt-3 text-sm text-slate-700">
            Baseball uploads accept multiple angles. If the ball path or contact point is not clean enough, the report will explicitly say the video was not clear enough rather than guessing RPM or overclaiming accuracy.
          </p>
        ) : null}
        {isBasketball ? (
          <p className="mt-3 text-sm text-slate-700">
            Basketball now anchors off visible court markings, with free-throw and three-point defaults that remain editable if the camera angle is off.
          </p>
        ) : null}
        {isSoccer ? (
          <p className="mt-3 text-sm text-slate-700">
            Soccer defaults are set around field-line spacing so sprint, agility, and shooting clips stay conservative even when the camera is not perfectly placed.
          </p>
        ) : null}
        <p className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-500">
          <strong className="font-semibold text-slate-700">Video retention:</strong>{" "}
          Your video is deleted after successful analysis by default. Only extracted metrics and analysis metadata are retained.
        </p>
        {userRole !== "ADMIN" ? (
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Your membership includes up to {monthlySubmissionLimit} completed submissions per UTC calendar month. Uploads beyond that allowance are not processed.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="athlemetry-label">
          Drill
          <select
            name="drillDefinitionId"
            className="athlemetry-control"
            value={selectedDrillId}
            onChange={(event) => {
              const nextDrillId = event.target.value;
              const nextDrill = drills.find((drill) => drill.id === nextDrillId);
              const nextCaptureProfile = getDrillCaptureProfile(
                nextDrill ? { slug: nextDrill.slug, sport: nextDrill.sport } : undefined,
              );

              setSelectedDrillId(nextDrillId);
              setCameraAngle(nextCaptureProfile.cameraAngle);
              setDistanceFeet(nextCaptureProfile.measurementDistanceFeet);
            }}
          >
            {groupedDrills.map(([sport, sportDrills]) => (
              <optgroup key={sport} label={SPORT_LABELS[sport as keyof typeof SPORT_LABELS] ?? sport}>
                {sportDrills.map((drill) => (
                  <option key={drill.id} value={drill.id}>
                    {drill.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="athlemetry-label">
          Recording date
          <input
            type="datetime-local"
            name="recordingDate"
            className="athlemetry-control"
            required
          />
        </label>
      </div>

      {isBaseball ? (
        <label className="athlemetry-label">
          Baseball league distance
          <select
            name="baseballLeague"
            value={baseballLeague}
            onChange={(event) => {
              const nextLeague = event.target.value;
              const selectedLeague = BASEBALL_LEAGUE_OPTIONS.find((league) => league.key === nextLeague);
              setBaseballLeague(nextLeague);
              if (selectedLeague) setDistanceFeet(selectedLeague.distanceFeet);
            }}
            className="athlemetry-control"
          >
            {BASEBALL_LEAGUE_OPTIONS.map((league) => (
              <option key={league.key} value={league.key}>{league.label}</option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="athlemetry-label">
          Location
          <input
            name="location"
            className="athlemetry-control"
            placeholder="Field, cage, bullpen, gym, etc."
            required
          />
        </label>
        <label className="athlemetry-label">
          Video file
          <input
            name="video"
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
            className="athlemetry-control"
            required={!cameraFile}
          />
        </label>
      </div>

      {/* Browser camera recording alternative */}
      <div className="border-t border-slate-100 pt-4">
        <BrowserCameraRecorder
          onFileReady={(file) => setCameraFile(file)}
          disabled={pending}
        />
        {cameraFile ? (
          <p className="mt-2 text-xs text-teal-700">
            Camera recording will be used instead of the file picker above.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <label className="athlemetry-label">
          FPS
          <input
            name="frameRate"
            type="number"
            min={10}
            max={240}
            className="athlemetry-control"
            placeholder="30"
          />
        </label>
        <label className="athlemetry-label">
          Start frame
          <input
            name="startFrame"
            type="number"
            min={0}
            className="athlemetry-control"
            placeholder="0"
          />
        </label>
        <label className="athlemetry-label">
          Finish frame
          <input
            name="finishFrame"
            type="number"
            min={1}
            className="athlemetry-control"
            placeholder="180"
          />
        </label>
        <label className="athlemetry-label">
          Repetition hint
          <input
            name="repetitionHint"
            type="number"
            min={0}
            className="athlemetry-control"
            placeholder={isBaseball ? "10" : isBasketball ? "8" : "6"}
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="athlemetry-label">
          Camera angle
          <select
            name="cameraAngle"
            value={cameraAngle}
            onChange={(event) => setCameraAngle(event.target.value)}
            className="athlemetry-control"
          >
            {CAMERA_ANGLE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="athlemetry-label">
          Athlete handedness
          <select name="athleteHandedness" defaultValue="unknown" className="athlemetry-control">
            {HANDEDNESS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="athlemetry-label">
          Clip quality
          <select name="clipQuality" defaultValue="good" className="athlemetry-control">
            {CLIP_QUALITY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="athlemetry-label">
          {captureProfile.distanceLabel}
          <div className="mt-1 rounded-2xl border border-slate-200 bg-white/85 px-3 py-3 shadow-sm">
            <input
              name="measurementDistanceFeetRange"
              type="range"
              min={captureProfile.distanceMinFeet}
              max={captureProfile.distanceMaxFeet}
              step={captureProfile.distanceStep}
              value={distanceFeet}
              onChange={(event) => setDistanceFeet(Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : captureProfile.measurementDistanceFeet)}
              className="h-2 w-full accent-teal-700"
            />
            <div className="mt-3 flex items-center gap-3">
              <input
                name="measurementDistanceFeet"
                type="number"
                min={captureProfile.distanceMinFeet}
                max={captureProfile.distanceMaxFeet}
                step={captureProfile.distanceStep}
                value={distanceFeet}
                onChange={(event) => setDistanceFeet(Number(event.target.value || captureProfile.measurementDistanceFeet))}
                className="athlemetry-control w-28"
              />
              <span className="text-sm font-medium text-slate-700">ft</span>
              <span className="text-xs text-slate-500">Default: {captureProfile.measurementDistanceFeet.toFixed(1)} ft</span>
            </div>
          </div>
        </label>
      </div>

      <label className="athlemetry-label">
        Notes for analysis
        <textarea
          name="notes"
          rows={3}
          className="athlemetry-control"
          placeholder={
            isBaseball
              ? "Examples: bullpen from open side, radar gun said ~82 mph, catcher glove visible, contact frame partially blocked."
              : isBasketball
                ? "Examples: free-throw line visible, three-point line visible, release point slightly off-angle."
                : "Anything the reviewer or analysis pipeline should know about this clip."
          }
        />
      </label>

      {(userRole === "COACH" || userRole === "ADMIN") ? (
        <label className="athlemetry-label">
          Video review retention
          <select name="reviewRetentionDays" defaultValue="0" className="athlemetry-control">
            <option value="0">Default — remove after analysis</option>
            <option value="7">Keep for 7 days</option>
            <option value="30">Keep for 30 days</option>
            <option value="90">Keep for 90 days</option>
          </select>
        </label>
      ) : (
        <input type="hidden" name="reviewRetentionDays" value="0" />
      )}

      <div>
        <div className="h-2 w-full rounded-full bg-slate-200">
          <div className="h-2 rounded-full bg-teal-700 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-1 text-xs text-slate-500">Upload progress: {progress}%</p>
      </div>

      {message ? <p className="athlemetry-message">{message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="athlemetry-button athlemetry-button-primary disabled:opacity-60"
      >
        {pending ? "Uploading..." : "Submit drill"}
      </button>
    </form>
  );
}
