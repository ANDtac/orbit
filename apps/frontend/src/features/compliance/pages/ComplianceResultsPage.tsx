import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef, OffsetPagination } from "@/components/ui/DataTable";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { ComplianceResult, ComplianceResultStatus } from "@/lib/types";

import {
  fetchComplianceResults,
  fetchPolicies,
  fetchRules,
} from "../api/compliance.api";
import { ResultsFilterBar } from "../components/ResultsFilterBar";

const PER_PAGE = 15;

function statusClasses(status: ComplianceResultStatus): string {
  switch (status) {
    case "pass":
      return "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.35)]";
    case "fail":
      return "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.35)]";
    case "error":
      return "bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.35)]";
    default:
      return "bg-slate-400";
  }
}

function ResultDetailPanel({ details }: { details?: Record<string, unknown> }) {
  if (!details) return <p className="text-xs text-muted">No details available.</p>;

  const knownFields: Array<[string, string]> = [
    ["expression", "Rule Expression"],
    ["matched_value", "Matched Value"],
    ["expected_value", "Expected Value"],
    ["config_snippet", "Config Snippet"],
    ["message", "Message"],
    ["error", "Error"],
  ];

  const rendered = knownFields.filter(([key]) => details[key] !== undefined);
  const knownKeys = knownFields.map(([f]) => f);
  const hasExtra = Object.keys(details).some((k) => !knownKeys.includes(k));

  return (
    <div className="space-y-2">
      {rendered.map(([key, label]) => (
        <div key={key}>
          <span className="text-xs font-medium text-muted">{label}: </span>
          <span className="font-mono text-xs text-text">{String(details[key])}</span>
        </div>
      ))}
      {hasExtra && (
        <details>
          <summary className="cursor-pointer text-xs text-muted">Raw details</summary>
          <pre className="mt-1 overflow-auto rounded bg-background/60 p-2 text-xs">{JSON.stringify(details, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

export function ComplianceResultsPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [deviceId, setDeviceId] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [status, setStatus] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const queryOptions = useMemo(
    () => ({
      page,
      per_page: PER_PAGE,
      sort: "-evaluated_at",
      device_id: deviceId ? Number(deviceId) : undefined,
      policy_id: policyId ? Number(policyId) : undefined,
      rule_id: ruleId ? Number(ruleId) : undefined,
      status: status || undefined,
    }),
    [page, deviceId, policyId, ruleId, status],
  );

  const resultsQuery = useQuery({
    queryKey: [QUERY_KEYS.complianceResults, queryOptions],
    queryFn: () => fetchComplianceResults(queryOptions),
  });

  const policiesQuery = useQuery({
    queryKey: [QUERY_KEYS.compliancePolicies],
    queryFn: () => fetchPolicies({ per_page: 200 }),
    staleTime: 5 * 60 * 1000,
  });

  const rulesQuery = useQuery({
    queryKey: [QUERY_KEYS.complianceRules],
    queryFn: () => fetchRules({ per_page: 200 }),
    staleTime: 5 * 60 * 1000,
  });

  const devicesQuery = useQuery({
    queryKey: [QUERY_KEYS.devices, "complianceResultsLookup"],
    queryFn: async () => {
      const pageData = await fetchDevices({ "page[size]": 200, sort: "name" });
      return pageData.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const policyNames = useMemo(
    () =>
      (policiesQuery.data ?? []).reduce<Record<number, string>>((acc, policy) => {
        acc[policy.id] = policy.name;
        return acc;
      }, {}),
    [policiesQuery.data],
  );

  const ruleNames = useMemo(
    () =>
      (rulesQuery.data ?? []).reduce<Record<number, string>>((acc, rule) => {
        acc[rule.id] = rule.name;
        return acc;
      }, {}),
    [rulesQuery.data],
  );

  const deviceNames = useMemo(
    () =>
      (devicesQuery.data ?? []).reduce<Record<number, string>>((acc, device) => {
        acc[device.id] = device.name;
        return acc;
      }, {}),
    [devicesQuery.data],
  );

  const stats = useMemo(() => {
    return (resultsQuery.data ?? []).reduce<Record<ComplianceResultStatus, number>>(
      (acc, result) => {
        acc[result.status] += 1;
        return acc;
      },
      { pass: 0, fail: 0, skip: 0, error: 0 },
    );
  }, [resultsQuery.data]);

  async function handleExportCsv() {
    setIsExporting(true);
    try {
      const allResults = await fetchComplianceResults({
        page: 1,
        per_page: 10000,
        sort: "-evaluated_at",
        device_id: deviceId ? Number(deviceId) : undefined,
        policy_id: policyId ? Number(policyId) : undefined,
        rule_id: ruleId ? Number(ruleId) : undefined,
        status: status || undefined,
      });

      const headers = ["device", "policy", "rule", "status", "evaluated_at"];
      const rows = allResults.map((result) => [
        deviceNames[result.device_id] ?? `Device #${result.device_id}`,
        policyNames[result.policy_id] ?? `Policy #${result.policy_id}`,
        result.rule_id ? ruleNames[result.rule_id] ?? `Rule #${result.rule_id}` : "",
        result.status,
        result.evaluated_at ?? "",
      ]);

      const csvContent = [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `compliance-results-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      toast.success("Export ready");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  const columns: ColumnDef<ComplianceResult>[] = [
    {
      key: "device_id",
      header: "Device",
      accessor: (result) => deviceNames[result.device_id] ?? `Device #${result.device_id}`,
    },
    {
      key: "policy_id",
      header: "Policy",
      accessor: (result) => policyNames[result.policy_id] ?? `Policy #${result.policy_id}`,
    },
    {
      key: "rule_id",
      header: "Rule",
      accessor: (result) => (result.rule_id ? ruleNames[result.rule_id] ?? `Rule #${result.rule_id}` : "—"),
    },
    {
      key: "status",
      header: "Status",
      accessor: (result) => (
        <span className="inline-flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusClasses(result.status)}`} />
          <span className="uppercase">{result.status}</span>
        </span>
      ),
    },
    {
      key: "evaluated_at",
      header: "Evaluated",
      accessor: (result) => (result.evaluated_at ? new Date(result.evaluated_at).toLocaleString() : "—"),
    },
  ];

  const pagination: OffsetPagination = {
    mode: "offset",
    page,
    perPage: PER_PAGE,
    hasMore: (resultsQuery.data ?? []).length === PER_PAGE,
    onPageChange: setPage,
  };

  return (
    <div className="space-y-4">
      {/* TODO: Add compliance trend chart (pass rate over time) — requires time-series API endpoint that returns daily pass/fail counts */}
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="Pass" value={stats.pass} tone="success" />
        <SummaryCard label="Fail" value={stats.fail} tone="danger" />
        <SummaryCard label="Skip" value={stats.skip} tone="muted" />
        <SummaryCard label="Error" value={stats.error} tone="warning" />
      </div>

      {/* TODO: Add group-by toggle (by device / by policy) to aggregate results — requires client-side aggregation or API-level grouping endpoint */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <ResultsFilterBar
            deviceId={deviceId}
            policyId={policyId}
            ruleId={ruleId}
            status={status}
            policies={policiesQuery.data ?? []}
            rules={rulesQuery.data ?? []}
            onChange={(field, value) => {
              setPage(1);
              if (field === "deviceId") setDeviceId(value);
              if (field === "policyId") setPolicyId(value);
              if (field === "ruleId") setRuleId(value);
              if (field === "status") setStatus(value);
            }}
          />
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={isExporting}
          className="shrink-0 rounded-xl border border-primary/30 bg-surface px-4 py-2 text-sm font-medium text-text shadow-sm transition hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isExporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      <DataTable
        columns={columns}
        data={resultsQuery.data ?? []}
        keyExtractor={(result) => result.id}
        pagination={pagination}
        expandable={{
          render: (result) => (
            <div className="px-3 py-2">
              <ResultDetailPanel details={result.details} />
            </div>
          ),
        }}
        isLoading={resultsQuery.isLoading}
        isError={resultsQuery.isError}
        errorMessage="Unable to load compliance results."
        onRetry={() => resultsQuery.refetch()}
        dense
        emptyState={
          <div className="space-y-2 text-center">
            <p className="text-sm text-muted">No compliance results match the current filters.</p>
          </div>
        }
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "danger" | "warning" | "muted";
}): JSX.Element {
  const toneClasses: Record<typeof tone, string> = {
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
    danger: "border-red-500/20 bg-red-500/10 text-red-500",
    warning: "border-orange-500/20 bg-orange-500/10 text-orange-500",
    muted: "border-primary/10 bg-surface text-text",
  };

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em]">{label}</p>
      <p className="mt-2 font-heading text-3xl">{value}</p>
    </div>
  );
}
