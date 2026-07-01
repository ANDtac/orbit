export type StatCardAccent = "primary" | "amber" | "red" | "emerald" | "muted";

interface StatCardProps {
  label: string;
  /** null = loading/unavailable; show skeleton instead of a value */
  value: number | null;
  suffix?: string;
  accent?: StatCardAccent;
  /** When provided, the card becomes an interactive button. */
  onClick?: () => void;
}

const ACCENT_TEXT: Record<StatCardAccent, string> = {
  primary: "text-primary",
  amber: "text-amber-500",
  red: "text-red-500",
  emerald: "text-emerald-500",
  muted: "text-text",
};

const ACCENT_BORDER: Record<StatCardAccent, string> = {
  primary: "border-primary/20",
  amber: "border-amber-500/20",
  red: "border-red-500/20",
  emerald: "border-emerald-500/20",
  muted: "border-primary/10",
};

export function StatCard({
  label,
  value,
  suffix = "",
  accent = "primary",
  onClick,
}: StatCardProps): JSX.Element {
  const baseClass = `rounded-2xl border bg-surface p-5 shadow-sm ${ACCENT_BORDER[accent]}`;

  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{label}</p>
      {value === null ? (
        <div className="mt-2 h-9 w-16 animate-pulse rounded-lg bg-primary/10" />
      ) : (
        <p className={`mt-1 font-heading text-3xl ${ACCENT_TEXT[accent]}`}>
          {value}
          {suffix}
        </p>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClass} cursor-pointer text-left transition hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2`}
      >
        {body}
      </button>
    );
  }

  return <article className={baseClass}>{body}</article>;
}
