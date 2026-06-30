// SECURITY: Credential profiles must not store raw passwords — only secret references
import { Input } from "@/components/ui/Input";

import type { CredentialProfileInput } from "../api/admin.api";

export interface CredentialFormValues {
  name: string;
  description: string;
  auth_type: string;
  username: string;
  secret_ref: string;
  is_active: boolean;
}

interface CredentialFormProps {
  values: CredentialFormValues;
  onChange: (field: keyof CredentialFormValues, value: string | boolean) => void;
  error?: string | null;
}

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

export function toCredentialPayload(values: CredentialFormValues): CredentialProfileInput {
  return {
    name: values.name.trim(),
    description: values.description.trim() || undefined,
    auth_type: values.auth_type.trim(),
    username: values.username.trim() || undefined,
    secret_ref: values.secret_ref.trim() || undefined,
    is_active: values.is_active,
  };
}

const AUTH_TYPE_OPTIONS = [
  { value: "username_password", label: "Username / Password" },
];

export function CredentialForm({
  values,
  onChange,
  error,
}: CredentialFormProps): JSX.Element {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1">
        <label className="block text-sm font-medium text-text" htmlFor="credential_name">
          Profile Name
          <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id="credential_name"
          name="credential_name"
          value={values.name}
          onChange={(event) => onChange("name", event.target.value)}
          className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-text" htmlFor="credential_auth_type">
          Auth Type
          <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
        </label>
        <select
          id="credential_auth_type"
          name="credential_auth_type"
          value={values.auth_type}
          onChange={(event) => onChange("auth_type", event.target.value)}
          className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:outline-none"
        >
          {AUTH_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">
          Additional authentication types (certificate-based, API key) will be available in a future release.
        </p>
      </div>

      <Input
        label="Username"
        name="credential_username"
        value={values.username}
        onChange={(event) => onChange("username", event.target.value)}
      />

      <div className="space-y-1">
        <label className="block text-sm font-medium text-text" htmlFor="credential_secret_ref">
          Secret Reference
          <InfoTooltip text="A reference path to the credential stored in your organization's secret manager (e.g., HashiCorp Vault: secret/orbit/device_ssh, or AWS Secrets Manager ARN). Orbit retrieves the actual password at connection time — it never stores passwords directly." />
        </label>
        <input
          id="credential_secret_ref"
          name="credential_secret_ref"
          value={values.secret_ref}
          onChange={(event) => onChange("secret_ref", event.target.value)}
          className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:outline-none"
          placeholder="secret/orbit/device_ssh"
        />
        <p className="mt-1 text-xs text-muted">
          Passwords are never stored in Orbit. Use this field to point to your secret manager.
        </p>
      </div>

      <Input
        label="Description"
        name="credential_description"
        value={values.description}
        onChange={(event) => onChange("description", event.target.value)}
      />

      <label className="flex items-center gap-3 rounded-xl border border-primary/10 bg-background/40 px-3 py-2 text-sm text-text">
        <input
          type="checkbox"
          checked={values.is_active}
          onChange={(event) => onChange("is_active", event.target.checked)}
          className="h-4 w-4 rounded border-primary/30 text-primary focus:ring-primary/50"
        />
        Credential profile is active
      </label>

      {error ? <p className="md:col-span-2 text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
