"use client";

import { useSyncExternalStore } from "react";

import { formatLocalDateTime, formatStableDate } from "@/app/submissions/local-time-format";

const subscribe = () => () => undefined;

/** A labelled, machine-readable timestamp shown in the viewer's own timezone. */
export function LocalTime({ iso, label = "Submitted" }: { iso: string; label?: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => formatLocalDateTime(iso),
    () => formatStableDate(iso),
  );
  return (
    <>
      {label} <time dateTime={iso}>{text}</time>
    </>
  );
}
