import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import clsx from "clsx";

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(function Toggle(
  { label, className, ...props },
  ref,
) {
  return (
    <label className="flex items-center gap-3 text-sm font-medium text-text">
      <input
        ref={ref}
        type="checkbox"
        className="peer sr-only"
        {...props}
      />
      <span
        className={clsx(
          "relative inline-flex h-6 w-11 items-center rounded-full bg-muted/60 transition peer-checked:bg-primary",
          className,
        )}
        aria-hidden="true"
      >
        <span className="ml-1 inline-block h-4 w-4 rounded-full bg-surface shadow transition peer-checked:translate-x-5 peer-checked:bg-white" />
      </span>
      {label ? <span>{label}</span> : null}
    </label>
  );
});
