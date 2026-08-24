"use client";

import { useState } from "react";

async function openHostedSession(endpoint: string, body?: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok || typeof payload.url !== "string") {
    throw new Error(payload.error || "Billing session could not be opened.");
  }
  window.location.assign(payload.url);
}

export function BillingActions({
  hasAccount,
  canStartCheckout,
  portalLabel = "Manage billing",
}: {
  hasAccount: boolean;
  canStartCheckout: boolean;
  portalLabel?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Billing request failed.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {canStartCheckout ? (
          <>
            <button disabled={busy} className="athlemetry-button athlemetry-button-primary" onClick={() => run(() => openHostedSession("/api/billing/checkout", { plan: "monthly" }))}>
              Start monthly plan
            </button>
            <button disabled={busy} className="athlemetry-button athlemetry-button-secondary" onClick={() => run(() => openHostedSession("/api/billing/checkout", { plan: "annual" }))}>
              Start annual plan
            </button>
          </>
        ) : null}
        {hasAccount ? (
          <button disabled={busy} className="athlemetry-button athlemetry-button-secondary" onClick={() => run(() => openHostedSession("/api/billing/portal"))}>
            {portalLabel}
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}
