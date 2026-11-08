import Link from "next/link";

type BackToSportsProps = {
  href?: string;
  label?: string;
};

export function BackToSports({ href = "/dashboard", label = "Dashboard" }: BackToSportsProps) {
  return (
    <Link
      href={href}
      className="athlemetry-chip min-h-11 border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5 7 10l5 5" />
      </svg>
      <span>{label}</span>
    </Link>
  );
}
