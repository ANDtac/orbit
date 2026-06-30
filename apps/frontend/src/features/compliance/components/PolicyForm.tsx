import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/Input";
import { fetchInventoryGroups } from "@/features/devices/api/groups.api";
import { fetchPlatforms } from "@/features/devices/api/platforms.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { InventoryGroup, Platform } from "@/lib/types";

export interface PolicyFormValues {
  name: string;
  description: string;
  scope: string;
  is_active: boolean;
}

interface PolicyFormProps {
  values: PolicyFormValues;
  onChange: (field: keyof PolicyFormValues, value: string | boolean) => void;
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

function parseScopeIds(scopeJson: string): { platformIds: number[]; groupIds: number[] } {
  try {
    const parsed = JSON.parse(scopeJson || "{}") as Record<string, unknown>;
    const platformIds = Array.isArray(parsed.platform_ids)
      ? (parsed.platform_ids as unknown[]).filter((v): v is number => typeof v === "number")
      : [];
    const groupIds = Array.isArray(parsed.inventory_group_ids)
      ? (parsed.inventory_group_ids as unknown[]).filter((v): v is number => typeof v === "number")
      : [];
    return { platformIds, groupIds };
  } catch {
    return { platformIds: [], groupIds: [] };
  }
}

function buildScopeJson(platformIds: number[], groupIds: number[]): string {
  const scope: Record<string, number[]> = {};
  if (platformIds.length > 0) scope.platform_ids = platformIds;
  if (groupIds.length > 0) scope.inventory_group_ids = groupIds;
  return JSON.stringify(scope);
}

interface CheckboxDropdownProps {
  label: string;
  items: Array<{ id: number; label: string }>;
  selectedIds: number[];
  allLabel: string;
  onToggle: (id: number) => void;
}

function CheckboxDropdown({ label: _label, items, selectedIds, allLabel, onToggle }: CheckboxDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const buttonLabel =
    selectedIds.length === 0
      ? allLabel
      : `${selectedIds.length} selected`;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text shadow-sm transition hover:border-primary focus:border-primary focus:outline-none"
      >
        <span>{buttonLabel}</span>
        <svg
          className={`ml-2 h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-primary/20 bg-surface shadow-lg">
          {items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted">No items available.</p>
          ) : (
            items.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text hover:bg-primary/5"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  onChange={() => onToggle(item.id)}
                  className="h-4 w-4 rounded border-primary/30 text-primary focus:ring-primary/50"
                />
                {item.label}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function PolicyForm({
  values,
  onChange,
  error,
}: PolicyFormProps): JSX.Element {
  const { data: platforms = [] } = useQuery<Platform[]>({
    queryKey: [QUERY_KEYS.platforms],
    queryFn: fetchPlatforms,
    staleTime: 5 * 60 * 1000,
  });

  const { data: groups = [] } = useQuery<InventoryGroup[]>({
    queryKey: [QUERY_KEYS.inventoryGroups],
    queryFn: fetchInventoryGroups,
    staleTime: 5 * 60 * 1000,
  });

  const { platformIds, groupIds } = parseScopeIds(values.scope);

  function togglePlatform(id: number) {
    const next = platformIds.includes(id)
      ? platformIds.filter((p) => p !== id)
      : [...platformIds, id];
    onChange("scope", buildScopeJson(next, groupIds));
  }

  function toggleGroup(id: number) {
    const next = groupIds.includes(id)
      ? groupIds.filter((g) => g !== id)
      : [...groupIds, id];
    onChange("scope", buildScopeJson(platformIds, next));
  }

  const platformItems = platforms.map((p) => ({
    id: p.id,
    label: p.display_name,
  }));

  const groupItems = groups.map((g) => ({
    id: g.id,
    label: g.name,
  }));

  return (
    <div className="space-y-4">
      <Input
        label="Policy Name"
        name="policy_name"
        value={values.name}
        onChange={(event) => onChange("name", event.target.value)}
      />
      <Input
        label="Description"
        name="policy_description"
        value={values.description}
        onChange={(event) => onChange("description", event.target.value)}
      />

      <div className="space-y-3">
        <div>
          <span className="text-sm font-medium text-text">
            Scope (optional)
            <InfoTooltip text="Limit this policy to specific platforms or device groups. Leave blank to apply to all devices." />
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-[0.18em] text-muted">
              Platforms
            </label>
            <CheckboxDropdown
              label="Platforms"
              items={platformItems}
              selectedIds={platformIds}
              allLabel="All platforms"
              onToggle={togglePlatform}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-[0.18em] text-muted">
              Inventory Groups
            </label>
            <CheckboxDropdown
              label="Groups"
              items={groupItems}
              selectedIds={groupIds}
              allLabel="All groups"
              onToggle={toggleGroup}
            />
          </div>
        </div>
      </div>

      <label className="flex items-center gap-3 rounded-xl border border-primary/10 bg-background/40 px-3 py-2 text-sm text-text">
        <input
          type="checkbox"
          checked={values.is_active}
          onChange={(event) => onChange("is_active", event.target.checked)}
          className="h-4 w-4 rounded border-primary/30 text-primary focus:ring-primary/50"
        />
        Policy is active and should be available for evaluation
      </label>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
