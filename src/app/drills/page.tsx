import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DrillsPage() {
  const drills = await prisma.drillDefinition.findMany({
    where: {
      isActive: true,
      sport: "soccer",
    },
    orderBy: {
      name: "asc",
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Standardized Drill Library</h1>
          <p className="mt-1 text-sm text-slate-600">
            Every drill enforces consistent recording guidelines for objective metric extraction.
          </p>
        </div>
        <Link href="/submissions/new" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          Submit a drill
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {drills.map((drill) => (
          <article key={drill.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{drill.name}</h2>
            <p className="mt-1 text-sm text-slate-600">{drill.description}</p>
            <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">Recording guidelines</p>
              <p className="mt-1">{drill.guidelines}</p>
            </div>
            {drill.instructionVideoUrl ? (
              <a
                href={drill.instructionVideoUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-sm font-medium text-slate-900 underline"
              >
                View instruction video
              </a>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
