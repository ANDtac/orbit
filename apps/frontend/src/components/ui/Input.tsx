import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import clsx from "clsx";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helperText, error, className, id, ...props },
  ref,
) {
  const inputId = id ?? props.name;
  const descriptionId = helperText ? `${inputId}-description` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="space-y-1">
      {label ? (
        <label className="block text-sm font-medium text-text" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className={clsx(
          "w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:shadow-focus focus:outline-none",
          error ? "border-red-400 focus:border-red-500 focus:shadow-none" : null,
          className,
        )}
        aria-describedby={[descriptionId, errorId].filter(Boolean).join(" ") || undefined}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {helperText ? (
        <p id={descriptionId} className="text-sm text-muted">
          {helperText}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-red-500">
          {error}
        </p>
      ) : null}
    </div>
  );
});
