"use client";

import { useMemo, useState, type FormEvent } from "react";

type ValidationDrill = { id: string; name: string; slug: string; metrics: string[] };
type ValidationRecord = { id: string; metricName: string; modelVersion: string; status: string; drillDefinition: { name: string }; submittedByUserId: string | null };

export function MetricValidationPanel({ drills, records, currentUserId }: { drills: ValidationDrill[]; records: ValidationRecord[]; currentUserId: string }) {
  const [drillId, setDrillId] = useState(drills[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const drill = useMemo(() => drills.find((candidate) => candidate.id === drillId) ?? drills[0], [drillId, drills]);

  async function submitEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const data = new FormData(event.currentTarget);
    const capabilityEvidenceRaw = String(data.get("capabilityEvidence") ?? "");
    let capabilityEvidence: unknown;
    try {
      capabilityEvidence = JSON.parse(capabilityEvidenceRaw);
    } catch {
      setBusy(false);
      setMessage("Capability evidence must be valid JSON.");
      return;
    }
    const response = await fetch("/api/admin/metric-validation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        drillDefinitionId: drillId,
        metricName: data.get("metricName"),
        modelVersion: data.get("modelVersion"),
        sampleSize: Number(data.get("sampleSize")),
        p90Error: Number(data.get("p90Error")),
        failureRate: Number(data.get("failureRate")),
        confidenceCalibrationError: Number(data.get("confidenceCalibrationError")),
        expertAgreement: Number(data.get("expertAgreement")),
        evidenceUri: data.get("evidenceUri"),
        evidenceSha256: data.get("evidenceSha256"),
        reviewedBy: data.get("reviewedBy"),
        capabilityEvidence,
      }),
    });
    const payload = await response.json();
    setBusy(false);
    setMessage(response.ok ? "Evidence submitted for second-admin approval. Reload to view the record." : payload.error || "Evidence submission failed.");
  }

  async function approve(validationId: string) {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/admin/metric-validation/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ validationId }),
    });
    const payload = await response.json();
    setBusy(false);
    setMessage(response.ok ? "Validation approved and customer release gate opened." : `${payload.error || "Approval failed."}${payload.reasons ? ` ${payload.reasons.join(", ")}` : ""}`);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submitEvidence} className="athlemetry-card grid gap-4 p-5 md:grid-cols-2 md:p-6">
        <label className="athlemetry-label">Drill<select className="athlemetry-control" value={drillId} onChange={(event) => setDrillId(event.target.value)}>{drills.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="athlemetry-label">Metric<select name="metricName" className="athlemetry-control">{drill?.metrics.map((metric) => <option key={metric}>{metric}</option>)}</select></label>
        <label className="athlemetry-label">Analyzed model version<input required name="modelVersion" className="athlemetry-control" placeholder="vision-v1.2.3" /></label>
        <label className="athlemetry-label">Permission-cleared sample size<input required name="sampleSize" type="number" min="0" className="athlemetry-control" /></label>
        <label className="athlemetry-label">P90 ground-truth error<input required name="p90Error" type="number" min="0" step="any" className="athlemetry-control" /></label>
        <label className="athlemetry-label">Pipeline failure rate (0–1)<input required name="failureRate" type="number" min="0" max="1" step="any" className="athlemetry-control" /></label>
        <label className="athlemetry-label">Confidence calibration error (0–1)<input required name="confidenceCalibrationError" type="number" min="0" max="1" step="any" className="athlemetry-control" /></label>
        <label className="athlemetry-label">Expert agreement (0–1)<input required name="expertAgreement" type="number" min="0" max="1" step="any" className="athlemetry-control" /></label>
        <label className="athlemetry-label">Two expert reviewer IDs, comma-separated<input required name="reviewedBy" className="athlemetry-control" /></label>
        <label className="athlemetry-label md:col-span-2">Immutable HTTPS evidence report URI<input required name="evidenceUri" type="url" className="athlemetry-control" /></label>
        <label className="athlemetry-label md:col-span-2">Evidence report SHA-256<input required name="evidenceSha256" pattern="[A-Fa-f0-9]{64}" className="athlemetry-control" /></label>
        <label className="athlemetry-label md:col-span-2">Professional capability report JSON<textarea required name="capabilityEvidence" rows={12} className="athlemetry-control font-mono text-xs" placeholder='{"schemaVersion":"athlemetry-capability-validation-v1",...}' /></label>
        <button disabled={busy} className="athlemetry-button athlemetry-button-primary md:col-span-2">Submit validation evidence</button>
      </form>

      <div className="space-y-3">
        {records.map((record) => (
          <article key={record.id} className="athlemetry-card flex flex-wrap items-center justify-between gap-4 p-4">
            <div><p className="font-semibold text-slate-950">{record.drillDefinition.name} · {record.metricName}</p><p className="text-sm text-slate-600">{record.status} · model {record.modelVersion}</p></div>
            {record.status === "COLLECTING" ? <button disabled={busy || record.submittedByUserId === currentUserId} onClick={() => approve(record.id)} className="athlemetry-button athlemetry-button-secondary">Second-admin approve</button> : null}
          </article>
        ))}
      </div>
      {message ? <p className="athlemetry-message">{message}</p> : null}
    </div>
  );
}
