import clsx from "clsx";

interface LoadingOverlayProps {
  show: boolean;
  iconSrc: string;
  label?: string;
}

export function LoadingOverlay({ show, iconSrc, label }: LoadingOverlayProps): JSX.Element | null {
  if (!show) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-surface/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
        <img src={iconSrc} alt="Loading" className="h-16 w-16 animate-orbit-spin" />
        {label ? (
          <span className={clsx("text-sm font-medium", "text-primary")}>{label}</span>
        ) : null}
      </div>
    </div>
  );
}
