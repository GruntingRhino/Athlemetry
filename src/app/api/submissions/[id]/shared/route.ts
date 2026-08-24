import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { readSharedSubmissionForRecipient } from "@/lib/submission-sharing";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  try {
    const submission = await readSharedSubmissionForRecipient(session.user.id, id);

    if (!submission) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }

    return NextResponse.json({ submission });
  } catch {
    return NextResponse.json({ error: "Shared submission could not be retrieved safely." }, { status: 503 });
  }
}
