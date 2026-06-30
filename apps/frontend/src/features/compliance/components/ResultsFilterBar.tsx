import type { CompliancePolicy, ComplianceResultStatus, ComplianceRule } from "@/lib/types";

interface ResultsFilterBarProps {
  deviceId: string;
  policyId: string;
  ruleId: string;
  status: string;
  policies: CompliancePolicy[];
  rules: ComplianceRule[];
  onChange: (field: "deviceId" | "policyId" | "ruleId" | "status", value: string) => void;
}

export function ResultsFilterBar({
  deviceId,
  policyId,
  ruleId,
  status,
  policies,
  rules,
  onChange,
}: ResultsFilterBarProps): JSX.Element {
  return (
    <div className="grid gap-3 rounded-2xl border border-primary/10 bg-surface p-4 md:grid-cols-4">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Device ID
        </label>
        <input
          value={deviceId}
          onChange={(event) => onChange("deviceId", event.target.value)}
          className="w-full rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm text-text"
          placeholder="42"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Policy
        </label>
        <select
          value={policyId}
          onChange={(event) => onChange("policyId", event.target.value)}
          className="w-full rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm text-text"
        >
          <option value="">All policies</option>
          {policies.map((policy) => (
            <option key={policy.id} value={String(policy.id)}>
              {policy.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Rule
        </label>
        <select
          value={ruleId}
          onChange={(event) => onChange("ruleId", event.target.value)}
          className="w-full rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm text-text"
        >
          <option value="">All rules</option>
          {rules.map((rule) => (
            <option key={rule.id} value={String(rule.id)}>
              {rule.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Status
        </label>
        <select
          value={status}
          onChange={(event) => onChange("status", event.target.value)}
          className="w-full rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm text-text"
        >
          <option value="">All statuses</option>
          {(["pass", "fail", "skip", "error"] as ComplianceResultStatus[]).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
