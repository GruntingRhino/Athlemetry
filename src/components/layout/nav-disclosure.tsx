"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Native <details> disclosure that also closes on route change, outside click and Escape.
 * The header lives in the root layout, so without this the panel would stay open after navigating.
 */
export function NavDisclosure({
  summary,
  className,
  summaryClassName,
  children,
}: {
  summary: ReactNode;
  className?: string;
  summaryClassName?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const el = ref.current;
      if (el?.open && event.target instanceof Node && !el.contains(event.target)) el.open = false;
    }
    function onKeyDown(event: KeyboardEvent) {
      const el = ref.current;
      if (event.key === "Escape" && el?.open) {
        el.open = false;
        el.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details ref={ref} className={`group ${className ?? ""}`}>
      <summary className={`list-none cursor-pointer [&::-webkit-details-marker]:hidden ${summaryClassName ?? ""}`}>{summary}</summary>
      {children}
    </details>
  );
}
