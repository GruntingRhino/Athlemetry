"use client";

import { type FormEvent, useState } from "react";

type GoalProgressCheckIn = {
  progressPercent: number;
  note: string | null;
  createdAt: string;
};

type GoalProgressFormProps = {
  hasPerformanceGoal: boolean;
  initialCheckIns: GoalProgressCheckIn[];
};

export function GoalProgressForm({ hasPerformanceGoal, initialCheckIns }: GoalProgressFormProps) {
  const [checkIns, setCheckIns] = useState(initialCheckIns);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/goals/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          progressPercent: Number(formData.get("progressPercent")),
          note: formData.get("note"),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Goal progress could not be recorded.");
        return;
      }
      setCheckIns((current) => [data.checkIn as GoalProgressCheckIn, ...current].slice(0, 10));
      form.reset();
      setMessage("Goal progress recorded.");
    } catch {
      setMessage("Goal progress could not be recorded. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!hasPerformanceGoal) {
    return <p className="athlemetry-body">Add a performance goal above before recording a progress check-in.</p>;
  }

  return (
    <div className="grid gap-6">
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <label className="athlemetry-label">
          Self-reported progress (0–100%)
          <input className="athlemetry-control" name="progressPercent" type="number" min={0} max={100} required />
        </label>
        <label className="athlemetry-label">
          Check-in note (optional)
          <textarea className="athlemetry-control min-h-24" name="note" maxLength={500} />
        </label>
        <p className="text-xs leading-5 text-slate-600">Do not include contact details or external links in a check-in note.</p>
        {message ? <p className="athlemetry-message" role="status">{message}</p> : null}
        <button type="submit" disabled={saving} className="athlemetry-button athlemetry-button-primary w-fit disabled:opacity-60">
          {saving ? "Recording..." : "Record progress"}
        </button>
      </form>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Recent self-reported check-ins</h3>
        {checkIns.length === 0 ? (
          <p className="mt-2 athlemetry-body">No progress check-ins recorded yet.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {checkIns.map((checkIn) => (
              <li key={`${checkIn.createdAt}-${checkIn.progressPercent}`} className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                <div className="font-medium text-slate-900">{checkIn.progressPercent}% — {new Date(checkIn.createdAt).toLocaleDateString()}</div>
                {checkIn.note ? <p className="mt-1 whitespace-pre-wrap">{checkIn.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
