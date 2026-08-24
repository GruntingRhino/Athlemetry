import { collectPrometheusMetrics, isMetricsTokenAuthorized } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isMetricsTokenAuthorized(request.headers.get("authorization"))) {
    return new Response("Unauthorized.\n", {
      status: 401,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
        "www-authenticate": "Bearer",
      },
    });
  }

  const metrics = await collectPrometheusMetrics();
  return new Response(metrics, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
    },
  });
}
