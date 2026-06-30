import { useState } from "react";

import type { Platform } from "@/lib/types";

export interface TemplateFormValues {
  platform_id: string;
  name: string;
  description: string;
  op_type: string;
  template: string;
  variables: string;
  notes: string;
}

interface TemplateFormProps {
  platforms: Platform[];
  values: TemplateFormValues;
  onChange: (field: keyof TemplateFormValues, value: string) => void;
  error?: string | null;
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

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

// ─── Variable row types ──────────────────────────────────────────────────────

type VarType = "string" | "number" | "boolean";

interface VarRow {
  name: string;
  type: VarType;
  required: boolean;
  defaultValue: string;
}

function jsonToRows(json: string): VarRow[] {
  try {
    const parsed = JSON.parse(json || "{}") as Record<string, unknown>;
    return Object.entries(parsed).map(([name, def]) => {
      const d = (def ?? {}) as Record<string, unknown>;
      return {
        name,
        type: (d.type as VarType) ?? "string",
        required: Boolean(d.required ?? false),
        defaultValue: d.default != null ? String(d.default) : "",
      };
    });
  } catch {
    return [];
  }
}

function rowsToJson(rows: VarRow[]): string {
  const obj: Record<string, unknown> = {};
  for (const row of rows) {
    if (!row.name.trim()) continue;
    const entry: Record<string, unknown> = {
      type: row.type,
      required: row.required,
    };
    if (row.defaultValue !== "") {
      entry.default = row.defaultValue;
    }
    obj[row.name.trim()] = entry;
  }
  return JSON.stringify(obj, null, 2);
}

function newRow(): VarRow {
  return { name: "", type: "string", required: false, defaultValue: "" };
}

// ─── Variables builder component ─────────────────────────────────────────────

interface VariablesBuilderProps {
  value: string;
  onChange: (value: string) => void;
}

function VariablesBuilder({ value, onChange }: VariablesBuilderProps): JSX.Element {
  const [rows, setRows] = useState<VarRow[]>(() => jsonToRows(value));
  const [rawMode, setRawMode] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  function updateRows(next: VarRow[]) {
    setRows(next);
    onChange(rowsToJson(next));
  }

  function addRow() {
    updateRows([...rows, newRow()]);
  }

  function removeRow(index: number) {
    const next = rows.filter((_, i) => i !== index);
    updateRows(next);
  }

  function setRowField<K extends keyof VarRow>(index: number, field: K, val: VarRow[K]) {
    const next = rows.map((row, i) => (i === index ? { ...row, [field]: val } : row));

    // Validate uniqueness
    const names = next.map((r) => r.name.trim()).filter(Boolean);
    const hasDuplicates = names.length !== new Set(names).size;
    setRowError(hasDuplicates ? "Variable names must be unique." : null);

    updateRows(next);
  }

  function toggleMode() {
    if (!rawMode) {
      // Switching to raw: serialize current rows into raw JSON
      setRawMode(true);
    } else {
      // Switching back to builder: parse raw JSON
      try {
        const parsed = JSON.parse(value || "{}");
        if (typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Expected object");
        }
        setRows(jsonToRows(value));
        setRowError(null);
        setRawMode(false);
      } catch {
        setRowError("Could not parse raw JSON — fix errors before switching back.");
      }
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-text" htmlFor="template_variables">
          Variables
        </label>
        <button
          type="button"
          onClick={toggleMode}
          className="text-xs text-primary underline-offset-2 hover:underline"
        >
          {rawMode ? "Switch to builder" : "Switch to raw JSON"}
        </button>
      </div>

      {rawMode ? (
        <>
          <textarea
            id="template_variables"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={6}
            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 font-mono text-sm text-text shadow-sm transition focus:border-primary focus:shadow-focus focus:outline-none"
            placeholder={'{\n  "hostname": { "type": "string", "required": true }\n}'}
          />
          <p className="text-xs text-muted">Raw JSON object describing expected variables.</p>
        </>
      ) : (
        <>
          <div className="space-y-2">
            {rows.length === 0 ? (
              <p className="rounded-xl border border-primary/10 bg-background/40 px-3 py-3 text-xs text-muted">
                No variables defined. Click "Add variable" below to add one.
              </p>
            ) : (
              rows.map((row, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[1fr_auto_auto_1fr_auto] items-center gap-2 rounded-xl border border-primary/10 bg-background/40 px-3 py-2"
                >
                  <input
                    type="text"
                    value={row.name}
                    onChange={(event) => setRowField(index, "name", event.target.value)}
                    placeholder="variable_name"
                    className="rounded-lg border border-primary/20 bg-surface px-2 py-1 font-mono text-xs text-text focus:border-primary focus:outline-none"
                  />
                  <select
                    value={row.type}
                    onChange={(event) => setRowField(index, "type", event.target.value as VarType)}
                    className="rounded-lg border border-primary/20 bg-surface px-2 py-1 text-xs text-text focus:border-primary focus:outline-none"
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={row.required}
                      onChange={(event) => setRowField(index, "required", event.target.checked)}
                      className="rounded"
                    />
                    req
                  </label>
                  <input
                    type="text"
                    value={row.defaultValue}
                    onChange={(event) => setRowField(index, "defaultValue", event.target.value)}
                    placeholder="default (optional)"
                    className="rounded-lg border border-primary/20 bg-surface px-2 py-1 text-xs text-text focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    className="rounded-full p-1 text-muted hover:bg-red-500/10 hover:text-red-500"
                    aria-label="Remove variable"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={addRow}
            className="mt-1 rounded-full border border-primary/30 px-3 py-1 text-xs text-primary hover:bg-primary/10"
          >
            + Add variable
          </button>
          {rowError ? <p className="text-xs text-red-500">{rowError}</p> : null}
        </>
      )}
    </div>
  );
}

// ─── Main form ───────────────────────────────────────────────────────────────

export function TemplateForm({
  platforms,
  values,
  onChange,
  error,
}: TemplateFormProps): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-text" htmlFor="template_platform">
            Platform
            <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
          </label>
          <select
            id="template_platform"
            value={values.platform_id}
            onChange={(event) => onChange("platform_id", event.target.value)}
            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:shadow-focus focus:outline-none"
          >
            <option value="">Select a platform</option>
            {platforms.map((platform) => (
              <option key={platform.id} value={String(platform.id)}>
                {platform.display_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-text" htmlFor="template_name">
            Template Name
            <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id="template_name"
            value={values.name}
            onChange={(event) => onChange("name", event.target.value)}
            placeholder="Backup running config"
            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:shadow-focus focus:outline-none"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="flex items-center text-sm font-medium text-text" htmlFor="template_op_type">
            Operation Type
            <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
            <InfoTooltip text="A category label for this template. Common types: backup, configure, show, audit. You can create your own types — the value is stored as-is and used to filter and organize templates." />
          </label>
          <input
            id="template_op_type"
            value={values.op_type}
            onChange={(event) => onChange("op_type", event.target.value)}
            placeholder="backup"
            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:shadow-focus focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-text" htmlFor="template_description">
            Description
          </label>
          <input
            id="template_description"
            value={values.description}
            onChange={(event) => onChange("description", event.target.value)}
            placeholder="Reusable backup workflow for this platform"
            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:shadow-focus focus:outline-none"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-text" htmlFor="template_body">
          Template Body
          <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
        </label>
        <details className="mb-2 rounded-lg border border-primary/10 bg-background/50 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted hover:text-text">
            Template syntax help ▾
          </summary>
          <div className="mt-2 space-y-1 text-xs text-muted">
            <p>Templates use <strong>Jinja2 syntax</strong>. Reference variables with <code className="rounded bg-primary/10 px-1 font-mono">{"{{ variable_name }}"}</code>.</p>
            <p>Each non-empty line is sent to the device as a separate command.</p>
            <p className="font-medium text-text">Examples:</p>
            <pre className="rounded bg-background px-2 py-1 font-mono text-xs">{"show running-config\nshow version"}</pre>
            <pre className="rounded bg-background px-2 py-1 font-mono text-xs">{"interface {{ interface }}\n description {{ description }}"}</pre>
          </div>
        </details>
        <textarea
          id="template_body"
          value={values.template}
          onChange={(event) => onChange("template", event.target.value)}
          rows={10}
          className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 font-mono text-sm text-text shadow-sm transition focus:border-primary focus:shadow-focus focus:outline-none"
          placeholder={"show running-config\n! hostname: {{ hostname }}"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <VariablesBuilder value={values.variables} onChange={(val) => onChange("variables", val)} />

        <div className="space-y-1">
          <label className="block text-sm font-medium text-text" htmlFor="template_notes">
            Notes
          </label>
          <textarea
            id="template_notes"
            value={values.notes}
            onChange={(event) => onChange("notes", event.target.value)}
            rows={6}
            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text shadow-sm transition focus:border-primary focus:shadow-focus focus:outline-none"
            placeholder="Validation notes, rollout caveats, or operator guidance"
          />
        </div>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
