import type { SchemaField, VariablesSchema } from "@/lib/types";

export interface SchemaFormProps {
  /** Field descriptors driving the rendered inputs. */
  schema: VariablesSchema;
  /** Current values, keyed by field name. Controlled by the parent. */
  value: Record<string, unknown>;
  /** Emits the next full value map whenever a field changes. */
  onChange: (next: Record<string, unknown>) => void;
  /** Per-field validation messages, keyed by field name. */
  errors?: Record<string, string>;
}

function fieldLabel(name: string, field: SchemaField): string {
  return field.label?.trim() || name;
}

function isEmpty(raw: unknown): boolean {
  return raw === undefined || raw === null || raw === "";
}

/**
 * Validate a value map against a variables schema. Pure helper (exported for
 * unit testing and for the parent to gate submit) — checks required, number
 * parsing, enum membership, and string `pattern` regexes.
 */
export function validateSchemaForm(
  schema: VariablesSchema,
  value: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const [name, field] of Object.entries(schema)) {
    const raw = value[name];
    const label = fieldLabel(name, field);

    if (field.type === "boolean") {
      continue;
    }

    if (isEmpty(raw)) {
      if (field.required) {
        errors[name] = `${label} is required.`;
      }
      continue;
    }

    if (field.type === "number") {
      const num = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (Number.isNaN(num)) {
        errors[name] = `${label} must be a number.`;
      }
      continue;
    }

    if (field.type === "enum") {
      const options = field.enum ?? [];
      if (options.length > 0 && !options.includes(String(raw))) {
        errors[name] = `${label} must be one of: ${options.join(", ")}.`;
      }
      continue;
    }

    if (field.type === "string" && field.pattern) {
      try {
        if (!new RegExp(field.pattern).test(String(raw))) {
          errors[name] = `${label} does not match the required format.`;
        }
      } catch {
        // An invalid pattern in the schema is not the operator's fault; skip.
      }
    }
  }

  return errors;
}

const CONTROL_CLASS =
  "w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:shadow-focus focus:outline-none";

/**
 * Dumb, controlled renderer that turns a variables schema into the appropriate
 * input per field (text/number/checkbox/select), showing required markers and
 * any `errors` supplied by the parent.
 */
export function SchemaForm({ schema, value, onChange, errors }: SchemaFormProps): JSX.Element {
  const entries = Object.entries(schema);

  function setField(name: string, next: unknown): void {
    onChange({ ...value, [name]: next });
  }

  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-primary/10 bg-background/40 px-3 py-3 text-sm text-muted">
        This action has no configurable inputs.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map(([name, field]) => {
        const label = fieldLabel(name, field);
        const error = errors?.[name];
        const fieldId = `schemafield-${name}`;
        const raw = value[name];

        return (
          <div key={name} className="space-y-1">
            {field.type === "boolean" ? (
              <label className="flex items-center gap-2 text-sm font-medium text-text" htmlFor={fieldId}>
                <input
                  id={fieldId}
                  type="checkbox"
                  checked={Boolean(raw)}
                  onChange={(event) => setField(name, event.target.checked)}
                  className="rounded"
                />
                {label}
                {field.required ? (
                  <span className="ml-0.5 text-red-500" aria-hidden="true">
                    *
                  </span>
                ) : null}
              </label>
            ) : (
              <>
                <label className="block text-sm font-medium text-text" htmlFor={fieldId}>
                  {label}
                  {field.required ? (
                    <span className="ml-0.5 text-red-500" aria-hidden="true">
                      *
                    </span>
                  ) : null}
                </label>

                {field.type === "enum" ? (
                  <select
                    id={fieldId}
                    value={raw === undefined || raw === null ? "" : String(raw)}
                    onChange={(event) => setField(name, event.target.value)}
                    aria-invalid={Boolean(error)}
                    className={CONTROL_CLASS}
                  >
                    <option value="">Select an option</option>
                    {(field.enum ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={fieldId}
                    type={field.type === "number" ? "number" : "text"}
                    value={raw === undefined || raw === null ? "" : String(raw)}
                    onChange={(event) => setField(name, event.target.value)}
                    aria-invalid={Boolean(error)}
                    className={CONTROL_CLASS}
                  />
                )}
              </>
            )}

            {field.help ? <p className="text-xs text-muted">{field.help}</p> : null}
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
