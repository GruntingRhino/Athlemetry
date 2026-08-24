"use client";

import { useRef } from "react";

type ReviewedKeyMoment = { frameIndex: number; label: string; note: string };

export function SubmissionVideoReview({
  submissionId,
  frameRate,
  keyMoments,
}: {
  submissionId: string;
  frameRate: number | null;
  keyMoments: ReviewedKeyMoment[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  function seekToFrame(frameIndex: number) {
    if (!videoRef.current || !frameRate || frameRate <= 0) return;
    videoRef.current.currentTime = frameIndex / frameRate;
    void videoRef.current.play().catch(() => undefined);
  }

  return (
    <section className="mt-5 rounded-[22px] border border-teal-100 bg-teal-50/60 p-4 md:p-5" aria-labelledby={`video-review-${submissionId}`}>
      <h2 id={`video-review-${submissionId}`} className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">Private video review</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">Review is available only while retained footage remains available. Labels and notes below are administrator-reviewed observations, not automated coaching, health, or performance claims.</p>
      <video ref={videoRef} controls preload="metadata" className="mt-4 block w-full rounded-2xl bg-slate-950" src={`/api/submissions/${submissionId}/video`}>
        Your browser cannot play this review video.
      </video>
      {keyMoments.length > 0 ? (
        <ol className="mt-4 space-y-3" aria-label="Reviewed video moments">
          {keyMoments.map((moment) => (
            <li key={`${moment.frameIndex}-${moment.label}`} className="rounded-2xl border border-teal-100 bg-white/80 p-3 text-sm text-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p><strong className="text-slate-950">{moment.label}</strong> · frame {moment.frameIndex}</p>
                {frameRate && frameRate > 0 ? <button className="athlemetry-button athlemetry-button-secondary px-3 py-1 text-xs" type="button" onClick={() => seekToFrame(moment.frameIndex)}>Seek to moment</button> : null}
              </div>
              <p className="mt-1">{moment.note}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
