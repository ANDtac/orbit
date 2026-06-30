import { useState } from "react";

import { Button } from "@/components/ui/Button";

interface PasswordChangeFormProps {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmNewPasswordChange: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
  selectedCount: number;
  platformSummary: string[];
  canUseSessionPassword: boolean;
  isSubmitting?: boolean;
  error?: string | null;
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-block">
      <svg className="ml-1 inline h-3.5 w-3.5 cursor-help text-muted" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 w-64 -translate-x-1/2 rounded-lg bg-surface border border-primary/20 px-3 py-2 text-xs text-muted opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

// ─── Eye icons ────────────────────────────────────────────────────────────────

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
      <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
    </svg>
  );
}

// ─── Password field with show/hide toggle ─────────────────────────────────────

interface PasswordFieldProps {
  id: string;
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  error?: string;
  placeholder?: string;
}

function PasswordField({ id, label, value, onChange, helperText, error, placeholder }: PasswordFieldProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-center text-sm font-medium text-text">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 pr-10 text-sm text-text shadow-sm transition focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {helperText && !error ? (
        <p className="text-xs text-muted">{helperText}</p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : null}
    </div>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

export function PasswordChangeForm({
  currentPassword,
  newPassword,
  confirmNewPassword,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmNewPasswordChange,
  onBack,
  onContinue,
  selectedCount,
  platformSummary,
  canUseSessionPassword,
  isSubmitting = false,
  error,
}: PasswordChangeFormProps): JSX.Element {
  return (
    <section className="rounded-2xl border border-primary/10 bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-xl text-primary">Password change details</h3>
        <span className="rounded-full border border-primary/20 px-3 py-1 text-xs font-medium text-primary">
          {selectedCount} devices
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {platformSummary.map((label) => (
          <span
            key={label}
            className="rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1 text-xs font-medium text-secondary"
          >
            {label}
          </span>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        <PasswordField
          id="current_password"
          label={
            <>
              Current Password
              <InfoTooltip text="If your login credentials match the device credentials, check this option to use your session password without re-entering it. Otherwise, enter the current device password below." />
            </>
          }
          value={currentPassword}
          onChange={onCurrentPasswordChange}
          helperText={
            canUseSessionPassword
              ? "Leave blank to use the password stored in your current login session."
              : "Required to authenticate and validate the change."
          }
        />
        <PasswordField
          id="new_password"
          label="New Password"
          value={newPassword}
          onChange={onNewPasswordChange}
        />
        <PasswordField
          id="confirm_new_password"
          label="Confirm New Password"
          value={confirmNewPassword}
          onChange={onConfirmNewPasswordChange}
          error={
            confirmNewPassword && newPassword !== confirmNewPassword
              ? "Passwords do not match."
              : undefined
          }
        />
      </div>

      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} disabled={isSubmitting}>
          Back
        </Button>
        <Button onClick={onContinue} disabled={isSubmitting}>
          {isSubmitting ? "Starting…" : "Review and start"}
        </Button>
      </div>
    </section>
  );
}
