import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminRefundRequestsPage() {
  await requireRole(["ADMIN"]);
  const requests = await prisma.refundRequest.findMany({ include: { requester: { select: { email: true } }, billingAccount: { select: { stripeCustomerId: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return <div className="space-y-6"><section className="athlemetry-card p-6 md:p-8"><div className="athlemetry-kicker">Billing operations</div><h1 className="mt-4 athlemetry-section-heading">Refund request review</h1><p className="athlemetry-section-lead">Review requests only. Approved status does not execute a Stripe refund.</p></section><section className="space-y-3">{requests.map((request) => <article className="athlemetry-card p-5" key={request.id}><p className="font-semibold text-slate-950">{request.reason}</p><p className="mt-1 text-sm text-slate-600">{request.requester.email} · {request.createdAt.toISOString().slice(0, 10)} · {request.status}</p>{request.details ? <p className="mt-3 text-sm text-slate-700">{request.details}</p> : null}</article>)}</section></div>;
}
