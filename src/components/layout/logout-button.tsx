"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      className="athlemetry-button athlemetry-button-secondary px-4 py-2 text-sm"
      onClick={() => signOut({ callbackUrl: "/" })}
      type="button"
    >
      Log out
    </button>
  );
}
