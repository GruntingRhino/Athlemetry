import { UploadForm } from "@/components/forms/upload-form";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewSubmissionPage() {
  await requireUser();

  const drills = await prisma.drillDefinition.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return (
    <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">Submit drill footage</h1>
      <p className="mt-1 text-sm text-slate-600">
        Upload a standardized drill video with metadata tags for queue processing and metrics extraction.
      </p>
      <div className="mt-5">
        <UploadForm drills={drills} />
      </div>
    </div>
  );
}
