"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ReportWithdrawButtonProps = {
  reportId: string;
};

export function ReportWithdrawButton({ reportId }: ReportWithdrawButtonProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function withdraw() {
    setSubmitting(true);
    setMessage(null);
    const response = await fetch(`/api/reports/${reportId}/withdraw`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Failed to withdraw report.");
      setSubmitting(false);
      return;
    }

    setMessage("Report withdrawn.");
    router.refresh();
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        className="athlemetry-button athlemetry-button-secondary px-3 py-1.5 text-xs"
        disabled={submitting}
        onClick={withdraw}
      >
        {submitting ? "Withdrawing…" : "Withdraw report"}
      </button>
      {message ? <p className="mt-2 athlemetry-message text-xs">{message}</p> : null}
    </div>
  );
}
