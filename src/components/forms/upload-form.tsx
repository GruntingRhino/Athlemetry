"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { getDrillCaptureProfile } from "@/lib/drill-capture";
import { SPORT_LABELS } from "@/lib/constants";

type Drill = {
  id: string;
  name: string;
  slug: string;
  sport: string;
  guidelines?: string;
};

type UploadFormProps = {
  drills: Drill[];
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

export function UploadForm({ drills }: UploadFormProps) {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [selectedDrillId, setSelectedDrillId] = useState<string>(drills[0]?.id ?? "");

  const defaultDrill = useMemo(() => drills[0], [drills]);
  const selectedDrill = useMemo(
    () => drills.find((drill) => drill.id === selectedDrillId) ?? defaultDrill,
    [drills, defaultDrill, selectedDrillId],
  );
  const captureProfile = useMemo(
    () => getDrillCaptureProfile(selectedDrill ? { slug: selectedDrill.slug, sport: selectedDrill.sport } : undefined),
    [selectedDrill],
  );
  const defaultCaptureProfile = useMemo(
    () => getDrillCaptureProfile(defaultDrill ? { slug: defaultDrill.slug, sport: defaultDrill.sport } : undefined),
    [defaultDrill],
  );
  const [cameraAngle, setCameraAngle] = useState(captureProfile.cameraAngle);
  const [distanceFeet, setDistanceFeet] = useState(captureProfile.measurementDistanceFeet);

  useEffect(() => {
    setCameraAngle(captureProfile.cameraAngle);
    setDistanceFeet(captureProfile.measurementDistanceFeet);
  }, [captureProfile.cameraAngle, captureProfile.measurementDistanceFeet, selectedDrillId]);

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

    const recordingDate = formData.get("recordingDate");
    if (typeof recordingDate === "string" && recordingDate.length > 0) {
      const parsedRecordingDate = new Date(recordingDate);
      if (!Number.isNaN(parsedRecordingDate.getTime())) {
        formData.set("recordingDate", parsedRecordingDate.toISOString());
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
        };

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
      <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-5 text-sm text-emerald-950 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            {SPORT_LABELS[(selectedDrill?.sport as keyof typeof SPORT_LABELS) ?? "soccer"] ?? "Sport"}
          </span>
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-700/80">
            Upload guidance
          </span>
        </div>
        <h3 className="mt-3 text-lg font-semibold text-slate-900">{selectedDrill?.name ?? defaultDrill.name}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-700">{selectedDrill?.guidelines ?? "Use the drill instructions below for the cleanest upload."}</p>
        <p className="mt-3 text-sm font-medium text-emerald-900">{captureProfile.distanceHelp}</p>
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
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-700">
          Drill
          <select
            name="drillDefinitionId"
            className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 shadow-sm"
            value={selectedDrillId}
            onChange={(event) => setSelectedDrillId(event.target.value)}
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
        <label className="text-sm text-slate-700">
          Recording date
          <input
            type="datetime-local"
            name="recordingDate"
            className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 shadow-sm"
            required
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-700">
          Location
          <input
            name="location"
            className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 shadow-sm"
            placeholder="Field, cage, bullpen, gym, etc."
            required
          />
        </label>
        <label className="text-sm text-slate-700">
          Video file
          <input
            name="video"
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
            className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 shadow-sm"
            required
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <label className="text-sm text-slate-700">
          FPS
          <input
            name="frameRate"
            type="number"
            min={10}
            max={240}
            className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 shadow-sm"
            placeholder="30"
          />
        </label>
        <label className="text-sm text-slate-700">
          Start frame
          <input
            name="startFrame"
            type="number"
            min={0}
            className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 shadow-sm"
            placeholder="0"
          />
        </label>
        <label className="text-sm text-slate-700">
          Finish frame
          <input
            name="finishFrame"
            type="number"
            min={1}
            className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 shadow-sm"
            placeholder="180"
          />
        </label>
        <label className="text-sm text-slate-700">
          Repetition hint
          <input
            name="repetitionHint"
            type="number"
            min={0}
            className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 shadow-sm"
            placeholder={isBaseball ? "10" : isBasketball ? "8" : "6"}
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm text-slate-700">
          Camera angle
          <select
            name="cameraAngle"
            value={cameraAngle}
            onChange={(event) => setCameraAngle(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 shadow-sm"
          >
            {CAMERA_ANGLE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Athlete handedness
          <select name="athleteHandedness" defaultValue="unknown" className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 shadow-sm">
            {HANDEDNESS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Clip quality
          <select name="clipQuality" defaultValue="good" className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 shadow-sm">
            {CLIP_QUALITY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          {captureProfile.distanceLabel}
          <div className="mt-1 rounded-2xl border border-slate-300 bg-white px-3 py-3 shadow-sm">
            <input
              name="measurementDistanceFeetRange"
              type="range"
              min={captureProfile.distanceMinFeet}
              max={captureProfile.distanceMaxFeet}
              step={captureProfile.distanceStep}
              value={distanceFeet}
              onChange={(event) => setDistanceFeet(Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : captureProfile.measurementDistanceFeet)}
              className="h-2 w-full accent-emerald-600"
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
                className="w-28 rounded-xl border border-slate-300 px-3 py-2"
              />
              <span className="text-sm font-medium text-slate-700">ft</span>
              <span className="text-xs text-slate-500">Default: {captureProfile.measurementDistanceFeet.toFixed(1)} ft</span>
            </div>
          </div>
        </label>
      </div>

      <label className="block text-sm text-slate-700">
        Notes for analysis
        <textarea
          name="notes"
          rows={3}
          className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 shadow-sm"
          placeholder={
            isBaseball
              ? "Examples: bullpen from open side, radar gun said ~82 mph, catcher glove visible, contact frame partially blocked."
              : isBasketball
                ? "Examples: free-throw line visible, three-point line visible, release point slightly off-angle."
                : "Anything the reviewer or analysis pipeline should know about this clip."
          }
        />
      </label>

      <div>
        <div className="h-2 w-full rounded-full bg-slate-200">
          <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-1 text-xs text-slate-500">Upload progress: {progress}%</p>
      </div>

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "Uploading..." : "Submit drill"}
      </button>
    </form>
  );
}
