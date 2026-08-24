"use client";

import { useState } from "react";

import { RecommendationFeedbackForm } from "@/components/forms/recommendation-feedback-form";

type CoachingPlanActionsProps = {
  planId: string;
  recommendations: string[];
  initialCompletedActionIndexes: number[];
};

export function CoachingPlanActions({
  planId,
  recommendations,
  initialCompletedActionIndexes,
}: CoachingPlanActionsProps) {
  const [completedIndexes, setCompletedIndexes] = useState(() => new Set(initialCompletedActionIndexes));
  const [updatingIndex, setUpdatingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setCompleted(actionIndex: number, completed: boolean) {
    setUpdatingIndex(actionIndex);
    setError(null);
    try {
      const response = await fetch(`/api/coaching/plans/${planId}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionIndex, completed }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not update training-action completion.");
      }
      setCompletedIndexes((current) => {
        const next = new Set(current);
        if (completed) next.add(actionIndex);
        else next.delete(actionIndex);
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update training-action completion.");
    } finally {
      setUpdatingIndex(null);
    }
  }

  const completeCount = recommendations.filter((_, index) => completedIndexes.has(index)).length;
  return (
    <section className="mt-5" aria-labelledby={`training-actions-${planId}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={`training-actions-${planId}`} className="text-sm font-semibold text-slate-900">Training actions</h3>
        <span className="text-xs font-medium text-slate-600">{completeCount}/{recommendations.length} complete</span>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
      <ol className="mt-2 space-y-2">
        {recommendations.map((recommendation, index) => {
          const completed = completedIndexes.has(index);
          const updating = updatingIndex === index;
          return (
            <li key={`${index}-${recommendation}`} className="flex items-start gap-3 text-sm text-slate-700">
              <input
                aria-label={`Mark training action ${index + 1} complete`}
                checked={completed}
                className="mt-1 size-4 accent-teal-700"
                disabled={updating}
                onChange={(event) => void setCompleted(index, event.target.checked)}
                type="checkbox"
              />
              <div>
                <span className={completed ? "text-slate-500 line-through" : undefined}>{recommendation}</span>
                <RecommendationFeedbackForm coachingPlanId={planId} actionIndex={index} />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
