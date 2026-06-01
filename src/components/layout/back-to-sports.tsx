import Link from "next/link";

type BackToSportsProps = {
  href?: string;
  label?: string;
};

export function BackToSports({ href = "/#sports", label = "Back to sports" }: BackToSportsProps) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
      <span aria-hidden="true">←</span>
      <span>{label}</span>
    </Link>
  );
}