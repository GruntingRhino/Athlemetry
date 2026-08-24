import Link from "next/link";

type BackToSportsProps = {
  href?: string;
  label?: string;
};

export function BackToSports({ href = "/#sports", label = "Back to sports" }: BackToSportsProps) {
  return (
    <Link
      href={href}
      className="athlemetry-chip border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900"
    >
      <span aria-hidden="true">←</span>
      <span>{label}</span>
    </Link>
  );
}
