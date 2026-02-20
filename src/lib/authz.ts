import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

export type AppRole = "ATHLETE" | "PARENT" | "COACH" | "ADMIN";

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireRole(roles: AppRole[]) {
  const user = await requireUser();

  if (!roles.includes(user.role)) {
    redirect("/dashboard");
  }

  return user;
}

export function assertRole(role: string | undefined, allowed: AppRole[]) {
  return role ? allowed.includes(role as AppRole) : false;
}
