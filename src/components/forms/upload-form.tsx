"use client";

import { useMemo, useState, type FormEvent } from "react";

type Drill = {
  id: string;
  name: string;
  slug: string;
};

type UploadFormProps = {
  drills: Drill[];
};

export function UploadForm({ drills }: UploadFormProps) {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const defaultDrill = useMemo(() => drills[0], [drills]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setPending(true);
    setProgress(0);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const selected = drills.find((drill) => drill.id === formData.get("drillDefinitionId"));
    formData.set("drillType", selected?.slug || "sprint-20m");

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

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-700">
          Drill
          <select
            name="drillDefinitionId"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            defaultValue={defaultDrill.id}
          >
            {drills.map((drill) => (
              <option key={drill.id} value={drill.id}>
                {drill.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Recording date
          <input
            type="datetime-local"
            name="recordingDate"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            required
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-700">
          Location
          <input
            name="location"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            required
          />
        </label>
        <label className="text-sm text-slate-700">
          Video file
          <input
            name="video"
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
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
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="30"
          />
        </label>
        <label className="text-sm text-slate-700">
          Start frame
          <input
            name="startFrame"
            type="number"
            min={0}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="0"
          />
        </label>
        <label className="text-sm text-slate-700">
          Finish frame
          <input
            name="finishFrame"
            type="number"
            min={1}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="180"
          />
        </label>
        <label className="text-sm text-slate-700">
          Repetition hint
          <input
            name="repetitionHint"
            type="number"
            min={0}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="8"
          />
        </label>
      </div>

      <div>
        <div className="h-2 w-full rounded bg-slate-200">
          <div className="h-2 rounded bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-1 text-xs text-slate-500">Upload progress: {progress}%</p>
      </div>

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Uploading..." : "Submit drill"}
      </button>
    </form>
  );
}
