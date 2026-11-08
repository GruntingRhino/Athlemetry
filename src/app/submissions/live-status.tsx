"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  buildTimeline,
  isInFlight,
  nextPollDelayMs,
  parseStatusResponse,
  type TimelineStep,
} from "@/lib/processing-timeline";
import { getInProgressMessage } from "@/lib/result-presentation";

type TransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void>) => {
    ready: Promise<unknown>;
    updateCallbackDone: Promise<unknown>;
    finished: Promise<unknown>;
  };
};

/**
 * When the status changes, swap the card's content under a View Transition so
 * it morphs to the new state instead of jumping. Falls back to a plain refresh
 * when the browser has no View Transitions or the visitor prefers reduced motion.
 */
function refreshWithMorph(refresh: () => void, article: HTMLElement | null, submissionId: string) {
  const doc = document as TransitionDocument;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!article || reduceMotion || typeof doc.startViewTransition !== "function") {
    refresh();
    return;
  }

  article.style.viewTransitionName = `submission-${submissionId}`;
  const transition = doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const finish = () => {
          observer.disconnect();
          window.clearTimeout(timeout);
          // A timer, not requestAnimationFrame: frames don't run in a background tab and the transition would time out.
          window.setTimeout(resolve, 0);
        };
        const observer = new MutationObserver(finish);
        const timeout = window.setTimeout(finish, 2000);
        observer.observe(article, { childList: true, subtree: true, characterData: true });
        refresh();
      }),
  );
  const clearName = () => {
    article.style.viewTransitionName = "";
  };
  // A skipped or aborted transition (hidden tab, interrupted by navigation) rejects these; none of it matters to the visitor.
  void transition.ready.catch(() => undefined);
  void transition.updateCallbackDone.catch(() => undefined);
  void transition.finished.then(clearName, clearName);
}

function StepDot({ state }: { state: TimelineStep["state"] }) {
  const base = "relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full";
  const icon = "h-3 w-3";
  if (state === "done") {
    return (
      <span className={`${base} bg-teal-700 text-white`} aria-hidden="true">
        <svg viewBox="0 0 20 20" className={icon} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className={`${base} bg-rose-700 text-white`} aria-hidden="true">
        <svg viewBox="0 0 20 20" className={icon} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
      </span>
    );
  }
  if (state === "paused") {
    return (
      <span className={`${base} border-2 border-amber-600 bg-white`} aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className={`${base} border-2 border-teal-700 bg-white`} aria-hidden="true">
        <span className="absolute inset-0 rounded-full bg-teal-600/40 motion-safe:animate-[athlemetry-pulse_2.2s_cubic-bezier(0.16,1,0.3,1)_infinite]" />
        <span className="h-1.5 w-1.5 rounded-full bg-teal-700" />
      </span>
    );
  }
  return <span className={`${base} border-2 border-slate-300 bg-white`} aria-hidden="true" />;
}

export function LiveSubmissionStatus({
  submissionId,
  initialStatus,
  canPoll,
}: {
  submissionId: string;
  initialStatus: string;
  canPoll: boolean;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  // The server decides the status on every render; a polled value only wins until the next server render.
  const [observed, setObserved] = useState<{ basedOn: string; value: string } | null>(null);
  const [stalled, setStalled] = useState(false);
  const status = observed && observed.basedOn === initialStatus ? observed.value : initialStatus;

  useEffect(() => {
    if (!canPoll || !isInFlight(status)) return;

    let cancelled = false;
    let timer: number | undefined;
    let unchanged = 0;
    let failures = 0;

    const schedule = () => {
      timer = window.setTimeout(tick, nextPollDelayMs(unchanged));
    };

    async function tick() {
      if (cancelled) return;
      if (document.hidden) {
        schedule();
        return;
      }
      try {
        const response = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/status`, { cache: "no-store" });
        if (response.status === 401 || response.status === 404) return;
        if (!response.ok) throw new Error("status unavailable");
        const next = parseStatusResponse(await response.json());
        if (cancelled) return;
        failures = 0;
        if (next && next !== status) {
          setObserved({ basedOn: initialStatus, value: next });
          refreshWithMorph(() => router.refresh(), rootRef.current?.closest("article") ?? null, submissionId);
          return;
        }
        unchanged += 1;
      } catch {
        failures += 1;
        unchanged += 1;
        if (failures >= 5) {
          setStalled(true);
          return;
        }
      }
      schedule();
    }

    const onVisible = () => {
      if (document.hidden) return;
      window.clearTimeout(timer);
      unchanged = 0;
      void tick();
    };

    document.addEventListener("visibilitychange", onVisible);
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [canPoll, status, initialStatus, submissionId, router]);

  const steps = buildTimeline(status);
  if (!steps) return null;
  const message = getInProgressMessage(status);
  const current = steps.find((step) => step.state === "active" || step.state === "paused" || step.state === "failed");
  const updating = canPoll && !stalled && isInFlight(status);

  return (
    <div ref={rootRef} className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <ol className="space-y-0">
        {steps.map((step, index) => {
          const last = index === steps.length - 1;
          return (
            <li key={step.key} className="flex gap-3" aria-current={step.state === "active" ? "step" : undefined}>
              <div className="flex w-5 flex-col items-center">
                <StepDot state={step.state} />
                {last ? null : (
                  <span className="my-1 w-0.5 flex-1 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                    <span
                      className={`block h-full w-full origin-top bg-teal-700 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                        step.state === "done" ? "scale-y-100" : "scale-y-0"
                      }`}
                    />
                  </span>
                )}
              </div>
              <div className={last ? "pb-0" : "pb-4"}>
                <p className={`text-sm leading-5 ${step.state === "pending" ? "text-slate-600" : "font-semibold text-slate-950"}`}>{step.label}</p>
                {step.note ? <p className="mt-0.5 text-sm leading-5 text-slate-700">{step.note}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-prose text-sm leading-6 text-slate-800">{message}</p>
        <a href="/submissions" className="athlemetry-button athlemetry-button-secondary min-h-[44px] shrink-0 px-4 py-2 text-sm">
          Check again
        </a>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        {updating ? "This page updates by itself." : "This page isn't updating by itself right now. Use Check again."}
      </p>
      <p role="status" className="sr-only">
        {current ? `${current.label}. ${current.note ?? ""}` : ""}
      </p>
    </div>
  );
}
