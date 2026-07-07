import { useRef, useState } from "react";

import type { Platform } from "@/lib/types";

export interface TemplateFormValues {
  platform_id: string;
  name: string;
  description: string;
  op_type: string;
  template: string;
  variables: string;
  outputs: string;
  is_mutating: boolean;
  is_active: boolean;
  notes: string;
}

interface TemplateFormProps {
  platforms: Platform[];
  values: TemplateFormValues;
  existingOpTypes?: string[];
  onChange: (field: keyof TemplateFormValues, value: string | boolean) => void;
  error?: string | null;
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const iconRef = useRef<SVGSVGElement>(null);

  return (
    <span className="relative inline-block">
      <svg
        ref={iconRef}
        className="ml-1 inline h-3.5 w-3.5 cursor-help text-muted"
        viewBox="0 0 20 20"
        fill="currentColor"
        onMouseEnter={() => {
          const rect = iconRef.current?.getBoundingClientRect();
          if (rect) setPos({ top: rect.top, left: rect.left + rect.width / 2 });
        }}
        onMouseLeave={() => setPos(null)}
      >
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
      {pos && (
        <span
          style={{
            position: "fixed",
            top: pos.top - 8,
            left: pos.left,
            transform: "translate(-50%, -100%)",
            zIndex: 9999,
          }}
          className="pointer-events-none w-64 rounded-lg border border-primary/20 bg-surface px-3 py-2 text-xs text-muted shadow-lg"
        >
          {text}
        </span>
      )}
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
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}

function VariablesBuilder({ id, label, value, onChange, hint }: VariablesBuilderProps): JSX.Element {
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
    const names = next.map((r) => r.name.trim()).filter(Boolean);
    const hasDuplicates = names.length !== new Set(names).size;
    setRowError(hasDuplicates ? "Field names must be unique." : null);
    updateRows(next);
  }

  function toggleMode() {
    if (!rawMode) {
      setRawMode(true);
    } else {
      try {
        const parsed = JSON.parse(value || "{}");
        if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
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
        <label className="block text-sm font-medium text-text" htmlFor={id}>
          {label}
        </label>
        <button
          type="button"
          onClick={toggleMode}
          className="text-xs text-primary underline-offset-2 hover:underline"
        >
          {rawMode ? "Switch to builder" : "Switch to raw JSON"}
        </button>
      </div>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}

      {rawMode ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 font-mono text-sm text-text shadow-sm focus:border-primary focus:outline-none"
          placeholder={'{\n  "hostname": { "type": "string", "required": true }\n}'}
        />
      ) : (
        <>
          <div className="space-y-2">
            {rows.length === 0 ? (
              <p className="rounded-xl border border-primary/10 bg-background/40 px-3 py-3 text-xs text-muted">
                No fields defined.
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
                    onChange={(e) => setRowField(index, "name", e.target.value)}
                    placeholder="field_name"
                    className="rounded-lg border border-primary/20 bg-surface px-2 py-1 font-mono text-xs text-text focus:border-primary focus:outline-none"
                  />
                  <select
                    value={row.type}
                    onChange={(e) => setRowField(index, "type", e.target.value as VarType)}
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
                      onChange={(e) => setRowField(index, "required", e.target.checked)}
                      className="rounded"
                    />
                    req
                  </label>
                  <input
                    type="text"
                    value={row.defaultValue}
                    onChange={(e) => setRowField(index, "defaultValue", e.target.value)}
                    placeholder="default (optional)"
                    className="rounded-lg border border-primary/20 bg-surface px-2 py-1 text-xs text-text focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    className="rounded-full p-1 text-muted hover:bg-red-500/10 hover:text-red-500"
                    aria-label="Remove field"
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
            + Add field
          </button>
          {rowError ? <p className="text-xs text-red-500">{rowError}</p> : null}
        </>
      )}
    </div>
  );
}

// ─── Toggle ──────────────────────────────────────────────────────────────────

interface ToggleProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

function Toggle({ id, checked, onChange, label, description }: ToggleProps): JSX.Element {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <div className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          onClick={() => onChange(!checked)}
          className={`flex h-5 w-9 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
            checked ? "bg-primary" : "bg-primary/20"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              checked ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </div>
      </div>
      <div>
        <span className="text-sm font-medium text-text">{label}</span>
        {description ? <p className="text-xs text-muted">{description}</p> : null}
      </div>
    </label>
  );
}

// ─── Main form ───────────────────────────────────────────────────────────────

export function TemplateForm({
  platforms,
  values,
  existingOpTypes = [],
  onChange,
  error,
}: TemplateFormProps): JSX.Element {
  const datalistId = "op-type-suggestions";

  return (
    <div className="space-y-5">
      {/* Platform + Name */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-text" htmlFor="template_platform">
            Platform
            <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
          </label>
          <select
            id="template_platform"
            value={values.platform_id}
            onChange={(e) => onChange("platform_id", e.target.value)}
            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm focus:border-primary focus:outline-none"
          >
            <option value="">Select a platform</option>
            {platforms.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.display_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-text" htmlFor="template_name">
            Name
            <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id="template_name"
            value={values.name}
            onChange={(e) => onChange("name", e.target.value)}
            placeholder="Show BGP summary"
            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Category (op_type combobox) + Description */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="flex items-center text-sm font-medium text-text" htmlFor="template_op_type">
            Category
            <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
            <InfoTooltip text="Organizes templates by purpose. Choose from existing categories or type a new one. Common values: show, backup, configure, audit." />
          </label>
          <input
            id="template_op_type"
            list={datalistId}
            value={values.op_type}
            onChange={(e) => onChange("op_type", e.target.value)}
            placeholder="show"
            autoComplete="off"
            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm focus:border-primary focus:outline-none"
          />
          <datalist id={datalistId}>
            {[...new Set(["show", "configure", "backup", "audit", ...existingOpTypes])].sort().map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-text" htmlFor="template_description">
            Description
          </label>
          <input
            id="template_description"
            value={values.description}
            onChange={(e) => onChange("description", e.target.value)}
            placeholder="Brief description for operators"
            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Behaviour toggles */}
      <div className="rounded-xl border border-primary/10 bg-background/40 p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Behaviour</p>
        <Toggle
          id="template_is_mutating"
          checked={values.is_mutating}
          onChange={(v) => onChange("is_mutating", v)}
          label="Mutating"
          description="This template modifies device configuration. Operators must review a dry-run diff and explicitly confirm before it can run. A config snapshot is saved automatically before execution."
        />
        <Toggle
          id="template_is_active"
          checked={values.is_active}
          onChange={(v) => onChange("is_active", v)}
          label="Active"
          description="Active templates are visible to operators in the Automation Builder. Disable to hide from operators without deleting."
        />
      </div>

      {/* Template body */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-text" htmlFor="template_body">
          Template Body
          <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
        </label>
        <details className="mb-2 rounded-lg border border-primary/10 bg-background/50 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted hover:text-text">
            Syntax help ▾
          </summary>
          <div className="mt-2 space-y-1 text-xs text-muted">
            <p>Uses <strong>Jinja2 syntax</strong>. Reference inputs with <code className="rounded bg-primary/10 px-1 font-mono">{"{{ variable_name }}"}</code>. Each non-empty line is sent as a command.</p>
            <p className="font-medium text-text">Examples:</p>
            <pre className="rounded bg-background px-2 py-1 font-mono text-xs">{"show running-config\nshow version"}</pre>
            <pre className="rounded bg-background px-2 py-1 font-mono text-xs">{"interface {{ interface }}\n description {{ description }}"}</pre>
          </div>
        </details>
        <textarea
          id="template_body"
          value={values.template}
          onChange={(e) => onChange("template", e.target.value)}
          rows={8}
          className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 font-mono text-sm text-text shadow-sm focus:border-primary focus:outline-none"
          placeholder={"show running-config\n! hostname: {{ hostname }}"}
        />
      </div>

      {/* Inputs + Outputs builders side by side */}
      <div className="grid gap-4 md:grid-cols-2">
        <VariablesBuilder
          id="template_variables"
          label="Input variables"
          hint="Fields operators fill in when building an automation."
          value={values.variables}
          onChange={(v) => onChange("variables", v)}
        />
        <VariablesBuilder
          id="template_outputs"
          label="Output fields"
          hint="Named fields parsed from the device response. Enables typed data binding in multi-step automations."
          value={values.outputs}
          onChange={(v) => onChange("outputs", v)}
        />
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-text" htmlFor="template_notes">
          Notes
        </label>
        <textarea
          id="template_notes"
          value={values.notes}
          onChange={(e) => onChange("notes", e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text shadow-sm focus:border-primary focus:outline-none"
          placeholder="Validation notes, rollout caveats, or operator guidance"
        />
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
