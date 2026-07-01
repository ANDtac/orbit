import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import type { CompliancePolicy, ComplianceRule } from "@/lib/types";

interface RuleFormValues {
  name: string;
  description: string;
  severity: ComplianceRule["severity"];
  rule_type: string;
  expression: string;
  params: string;
}

interface RulesPanelProps {
  policy: CompliancePolicy | null;
  rules: ComplianceRule[];
  isLoading?: boolean;
  onEvaluate: (policy: CompliancePolicy) => Promise<void>;
  onCreateRule: (
    policy: CompliancePolicy,
    input: Omit<ComplianceRule, "id" | "policy_id" | "created_at" | "updated_at"> & {
      params?: Record<string, unknown>;
    },
  ) => Promise<void>;
  onUpdateRule: (
    rule: ComplianceRule,
    input: Partial<Omit<ComplianceRule, "id" | "policy_id" | "created_at" | "updated_at">> & {
      params?: Record<string, unknown>;
    },
  ) => Promise<void>;
  onDeleteRule: (rule: ComplianceRule) => Promise<void>;
}

const EMPTY_VALUES: RuleFormValues = {
  name: "",
  description: "",
  severity: "medium",
  rule_type: "regex",
  expression: "",
  params: "{}",
};

function severityClasses(severity: ComplianceRule["severity"]): string {
  switch (severity) {
    case "critical":
      return "border-red-500/30 bg-red-500/10 text-red-500";
    case "high":
      return "border-orange-500/30 bg-orange-500/10 text-orange-500";
    case "medium":
      return "border-amber-500/30 bg-amber-500/10 text-amber-500";
    default:
      return "border-primary/20 bg-primary/10 text-primary";
  }
}

function toFormValues(rule?: ComplianceRule | null): RuleFormValues {
  if (!rule) {
    return EMPTY_VALUES;
  }

  return {
    name: rule.name,
    description: rule.description ?? "",
    severity: rule.severity,
    rule_type: rule.rule_type,
    expression: rule.expression,
    params: JSON.stringify(rule.params ?? {}, null, 2),
  };
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

export function RulesPanel({
  policy,
  rules,
  isLoading = false,
  onEvaluate,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
}: RulesPanelProps): JSX.Element {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ComplianceRule | null>(null);
  const [viewRule, setViewRule] = useState<ComplianceRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ComplianceRule | null>(null);
  const [formValues, setFormValues] = useState<RuleFormValues>(EMPTY_VALUES);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  useEffect(() => {
    setIsFormOpen(false);
    setEditingRule(null);
    setViewRule(null);
    setDeleteTarget(null);
    setFormValues(EMPTY_VALUES);
    setFormError(null);
  }, [policy?.id]);

  function startEditRule(rule: ComplianceRule) {
    setEditingRule(rule);
    setFormValues(toFormValues(rule));
    setFormError(null);
    setViewRule(null);
    setIsFormOpen(true);
  }

  async function handleSubmit() {
    if (!policy) {
      return;
    }

    let parsedParams: Record<string, unknown> | undefined;
    try {
      parsedParams = formValues.params.trim()
        ? (JSON.parse(formValues.params) as Record<string, unknown>)
        : undefined;
    } catch {
      setFormError("Params must be valid JSON.");
      return;
    }

    if (!formValues.name.trim() || !formValues.rule_type.trim() || !formValues.expression.trim()) {
      setFormError("Name, rule type, and expression are required.");
      return;
    }

    setFormError(null);
    setIsSaving(true);
    try {
      const payload = {
        name: formValues.name.trim(),
        description: formValues.description.trim() || undefined,
        severity: formValues.severity,
        rule_type: formValues.rule_type.trim(),
        expression: formValues.expression.trim(),
        params: parsedParams,
      };
      if (editingRule) {
        await onUpdateRule(editingRule, payload);
        toast.success(`Rule "${payload.name}" updated.`);
      } else {
        await onCreateRule(policy, payload);
        toast.success(`Rule "${payload.name}" created.`);
      }
      setIsFormOpen(false);
      setEditingRule(null);
      setFormValues(EMPTY_VALUES);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save rule.";
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDeleteRule(deleteTarget);
      toast.success(`Rule "${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete rule.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleEvaluate() {
    if (!policy) {
      return;
    }

    // TODO: Add 'Preview evaluation' feature that dry-runs policy against a single device before fleet-wide execution
    setIsEvaluating(true);
    try {
      await onEvaluate(policy);
    } finally {
      setIsEvaluating(false);
    }
  }

  if (!policy) {
    return (
      <section className="rounded-2xl border border-primary/10 bg-surface p-6">
        <h2 className="font-heading text-lg text-text">Rules</h2>
        <p className="mt-3 text-sm text-muted">
          Select a compliance policy to review and maintain its rules.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-primary/10 bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Rules Panel</p>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="font-heading text-xl text-text">{policy.name}</h2>
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                policy.is_active
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                  : "border-primary/20 bg-primary/5 text-muted"
              }`}
            >
              {policy.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {policy.description ?? "Define granular compliance checks and queue an evaluation when the rule set is ready."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleEvaluate} disabled={isEvaluating}>
            Evaluate
          </Button>
          <Button
            onClick={() => {
              setEditingRule(null);
              setFormValues(EMPTY_VALUES);
              setFormError(null);
              setIsFormOpen(true);
            }}
          >
            New rule
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {isLoading ? <p className="text-sm text-muted">Loading rules…</p> : null}
        {!isLoading && !rules.length ? (
          <div className="rounded-2xl border border-dashed border-primary/20 bg-background/40 px-4 py-6 text-sm text-muted">
            No rules exist for this policy yet.
          </div>
        ) : null}
        {rules.map((rule) => (
          <article key={rule.id} className="rounded-2xl border border-primary/10 bg-background/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-text">{rule.name}</h3>
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold uppercase ${severityClasses(rule.severity)}`}>
                    {rule.severity}
                  </span>
                  <span className="inline-flex rounded-full border border-primary/20 px-2 py-1 font-mono text-xs text-primary">
                    {rule.rule_type}
                  </span>
                </div>
                <p className="text-sm text-muted">{rule.description ?? "No description provided."}</p>
                <pre className="overflow-x-auto rounded-xl bg-background px-3 py-2 font-mono text-xs text-text">
                  {rule.expression}
                </pre>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setViewRule(rule)}>
                  View
                </Button>
                <Button variant="ghost" size="sm" onClick={() => startEditRule(rule)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(rule)}>
                  Delete
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <Modal
        isOpen={Boolean(viewRule)}
        onClose={() => setViewRule(null)}
        title={viewRule ? viewRule.name : "Rule details"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setViewRule(null)}>
              Close
            </Button>
            <Button onClick={() => viewRule && startEditRule(viewRule)}>Edit rule</Button>
          </>
        }
      >
        {viewRule ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold uppercase ${severityClasses(viewRule.severity)}`}>
                {viewRule.severity}
              </span>
              <span className="inline-flex rounded-full border border-primary/20 px-2 py-1 font-mono text-xs text-primary">
                {viewRule.rule_type}
              </span>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Description</p>
              <p className="mt-1 text-sm text-text">{viewRule.description ?? "No description provided."}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Expression</p>
              <pre className="mt-1 overflow-x-auto rounded-xl bg-background px-3 py-2 font-mono text-xs text-text">
                {viewRule.expression}
              </pre>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Params</p>
              <pre className="mt-1 overflow-x-auto rounded-xl bg-background px-3 py-2 font-mono text-xs text-text">
                {JSON.stringify(viewRule.params ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingRule ? "Edit rule" : "Create rule"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {editingRule ? "Save rule" : "Create rule"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-text" htmlFor="rule_name_input">
              Rule Name
              <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="rule_name_input"
              name="rule_name"
              value={formValues.name}
              onChange={(event) =>
                setFormValues((current) => ({ ...current, name: event.target.value }))
              }
              className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text shadow-sm transition focus:border-primary focus:outline-none"
            />
          </div>
          <Input
            label="Description"
            name="rule_description"
            value={formValues.description}
            onChange={(event) =>
              setFormValues((current) => ({ ...current, description: event.target.value }))
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-text" htmlFor="rule_severity">
                Severity
                <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
                <InfoTooltip text="How urgently should this violation be addressed? Critical = immediate action required. High = address soon. Medium = schedule remediation. Low = informational." />
              </label>
              <select
                id="rule_severity"
                value={formValues.severity}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    severity: event.target.value as ComplianceRule["severity"],
                  }))
                }
                className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-text" htmlFor="rule_type_input">
                Rule Type
                <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
                <InfoTooltip text="The evaluation method for this rule. Examples: config_contains, regex_match, json_path_check. The rule type determines how the expression is interpreted." />
              </label>
              <input
                id="rule_type_input"
                name="rule_type"
                value={formValues.rule_type}
                onChange={(event) =>
                  setFormValues((current) => ({ ...current, rule_type: event.target.value }))
                }
                className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text shadow-sm transition focus:border-primary focus:outline-none"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-text" htmlFor="rule_expression">
              Expression
              <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
            </label>
            <details className="mb-2 rounded-lg border border-primary/10 bg-background/50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-muted hover:text-text">
                Expression syntax help ▾
              </summary>
              <div className="mt-2 space-y-1 text-xs text-muted">
                <p>The expression is evaluated against each device's configuration. Syntax depends on the Rule Type:</p>
                <ul className="ml-3 list-disc space-y-0.5">
                  <li><strong>config_contains</strong>: Plain text to search for in device config</li>
                  <li><strong>regex_match</strong>: Regular expression pattern, e.g. <code className="font-mono">ntp server \d+\.\d+\.\d+\.\d+</code></li>
                  <li><strong>json_path_check</strong>: JSONPath expression for structured data</li>
                </ul>
              </div>
            </details>
            <textarea
              id="rule_expression"
              value={formValues.expression}
              onChange={(event) =>
                setFormValues((current) => ({ ...current, expression: event.target.value }))
              }
              className="min-h-24 w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text shadow-sm transition focus:border-primary focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-text" htmlFor="rule_params">
              Params JSON
            </label>
            <details className="mb-2 rounded-lg border border-primary/10 bg-background/50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-muted hover:text-text">
                Params JSON help ▾
              </summary>
              <div className="mt-2 space-y-1 text-xs text-muted">
                <p>
                  Optional JSON parameters passed to the rule evaluator. Format depends on the rule type.
                  Example:{" "}
                  <code className="font-mono">{"{"}"expected_value": "md5", "path": "snmp.auth_protocol"{"}"}</code>
                </p>
              </div>
            </details>
            <textarea
              id="rule_params"
              value={formValues.params}
              onChange={(event) =>
                setFormValues((current) => ({ ...current, params: event.target.value }))
              }
              className="min-h-24 w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 font-mono text-sm text-text shadow-sm transition focus:border-primary focus:outline-none"
            />
          </div>
          {formError ? <p className="text-sm text-red-500">{formError}</p> : null}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete rule"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleDelete} disabled={isDeleting}>
              Delete rule
            </Button>
          </>
        }
      >
        <p className="text-sm text-text">
          Delete <strong>{deleteTarget?.name ?? "this rule"}</strong> from
          <strong> {policy.name}</strong>.
        </p>
      </Modal>
    </section>
  );
}
