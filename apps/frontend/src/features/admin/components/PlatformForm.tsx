import { Input } from "@/components/ui/Input";

import type { PlatformInput } from "../api/admin.api";

export interface PlatformFormValues {
  slug: string;
  display_name: string;
  vendor_hint: string;
  napalm_driver: string;
  netmiko_type: string;
  handler_entrypoint: string;
  ansible_network_os: string;
  notes: string;
  is_active: boolean;
}

interface PlatformFormProps {
  values: PlatformFormValues;
  onChange: (field: keyof PlatformFormValues, value: string | boolean) => void;
  error?: string | null;
}

export function toPlatformPayload(values: PlatformFormValues): PlatformInput {
  return {
    slug: values.slug.trim(),
    display_name: values.display_name.trim(),
    vendor_hint: values.vendor_hint.trim() || undefined,
    napalm_driver: values.napalm_driver.trim() || undefined,
    netmiko_type: values.netmiko_type.trim() || undefined,
    handler_entrypoint: values.handler_entrypoint.trim() || undefined,
    ansible_network_os: values.ansible_network_os.trim() || undefined,
    notes: values.notes.trim() || undefined,
    is_active: values.is_active,
  };
}

export function PlatformForm({
  values,
  onChange,
  error,
}: PlatformFormProps): JSX.Element {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1">
        <label className="block text-sm font-medium text-text" htmlFor="platform_slug">
          Slug
          <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id="platform_slug"
          name="platform_slug"
          value={values.slug}
          onChange={(event) => onChange("slug", event.target.value)}
          className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:outline-none"
        />
      </div>
      <Input
        label="Display Name"
        name="platform_display_name"
        value={values.display_name}
        onChange={(event) => onChange("display_name", event.target.value)}
      />
      <Input
        label="Vendor Hint"
        name="platform_vendor_hint"
        value={values.vendor_hint}
        onChange={(event) => onChange("vendor_hint", event.target.value)}
      />
      <Input
        label="NAPALM Driver"
        name="platform_napalm_driver"
        value={values.napalm_driver}
        onChange={(event) => onChange("napalm_driver", event.target.value)}
      />
      <Input
        label="Netmiko Type"
        name="platform_netmiko_type"
        value={values.netmiko_type}
        onChange={(event) => onChange("netmiko_type", event.target.value)}
      />
      <Input
        label="Ansible network_os"
        name="platform_ansible_network_os"
        value={values.ansible_network_os}
        onChange={(event) => onChange("ansible_network_os", event.target.value)}
      />
      <Input
        label="Handler Entrypoint"
        name="platform_handler_entrypoint"
        value={values.handler_entrypoint}
        onChange={(event) => onChange("handler_entrypoint", event.target.value)}
      />
      <label className="flex items-center gap-3 rounded-xl border border-primary/10 bg-background/40 px-3 py-2 text-sm text-text">
        <input
          type="checkbox"
          checked={values.is_active}
          onChange={(event) => onChange("is_active", event.target.checked)}
          className="h-4 w-4 rounded border-primary/30 text-primary focus:ring-primary/50"
        />
        Platform is active
      </label>
      <div className="space-y-1 md:col-span-2">
        <label className="block text-sm font-medium text-text" htmlFor="platform_notes">
          Notes
        </label>
        <textarea
          id="platform_notes"
          value={values.notes}
          onChange={(event) => onChange("notes", event.target.value)}
          className="min-h-24 w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text shadow-sm transition focus:border-primary focus:outline-none"
        />
      </div>
      {error ? <p className="md:col-span-2 text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
