import { redirect } from "next/navigation";

import { canUsePaidFeatures } from "@/lib/billing";

export async function requirePaidFeatureAccess(user: { id: string; role?: string }) {
  if (!await canUsePaidFeatures(user.id, user.role)) {
    redirect("/billing?required=subscription");
  }
}
