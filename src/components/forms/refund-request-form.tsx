"use client";

import { type FormEvent, useState } from "react";

export function RefundRequestForm() {
  const [message, setMessage] = useState<string | null>(null);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/billing/refund-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: form.get("reason"), details: form.get("details") }) });
    const data = await response.json();
    setMessage(response.ok ? "Refund request submitted for review. No refund has been issued." : data.error ?? "Refund request failed.");
  }
  return <form className="space-y-3" onSubmit={onSubmit}><label className="block text-sm font-medium text-slate-700">Reason<input required name="reason" minLength={3} maxLength={160} className="mt-1 athlemetry-control" /></label><label className="block text-sm font-medium text-slate-700">Details (optional)<textarea name="details" maxLength={2000} rows={3} className="mt-1 athlemetry-control" /></label><p className="text-xs text-slate-500">Do not include contact details or links. A request is reviewed by Athlemetry; it does not automatically issue a refund.</p><button className="athlemetry-button athlemetry-button-secondary" type="submit">Request refund review</button>{message ? <p className="athlemetry-message text-sm">{message}</p> : null}</form>;
}
