"use client";

import { useState, type FormEvent } from "react";

type RecommendationFeedbackFormProps = {
  coachingPlanId: string;
  actionIndex: number;
};

export function RecommendationFeedbackForm({ coachingPlanId, actionIndex }: RecommendationFeedbackFormProps) {
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        coachingPlanId,
        recommendationActionIndex: actionIndex,
        requestType: "HUMAN_REVIEW",
        reason: formData.get("reason"),
        details: formData.get("details"),
      }),
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    setMessage(response.ok ? "Recommendation feedback submitted for administrator review." : body?.error ?? "Feedback could not be submitted.");
  }

  return (
    <details className="mt-2 text-xs text-slate-600">
      <summary className="cursor-pointer font-medium text-teal-800">Request recommendation review</summary>
      <form className="mt-2 space-y-2" onSubmit={onSubmit}>
        <input name="reason" required maxLength={120} className="athlemetry-control text-xs" placeholder="Reason for review" />
        <textarea name="details" maxLength={400} rows={2} className="athlemetry-control text-xs" placeholder="Optional details (do not include contact details or links)" />
        <p>Feedback does not change this recommendation automatically or schedule training.</p>
        <button type="submit" className="athlemetry-button athlemetry-button-secondary px-3 py-1.5 text-xs">Submit feedback</button>
        {message ? <p role="status">{message}</p> : null}
      </form>
    </details>
  );
}
