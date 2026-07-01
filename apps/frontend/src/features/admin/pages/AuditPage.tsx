import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef, CursorPagination } from "@/components/ui/DataTable";
import { QUERY_KEYS } from "@/lib/constants";
import type { AuditLogEntry } from "@/lib/types";

import { fetchAuditEntries } from "../api/admin.api";

const KNOWN_TARGET_TYPES = [
  "device",
  "platform",
  "credential_profile",
  "policy",
  "rule",
  "inventory_group",
  "user",
];

function actionBadge(action: string): string {
  if (action.includes("delete")) return "border-red-500/20 bg-red-500/10 text-red-500";
  if (action.includes("update")) return "border-amber-500/20 bg-amber-500/10 text-amber-500";
  if (action.includes("create")) return "border-emerald-500/20 bg-emerald-500/10 text-emerald-500";
  return "border-primary/20 bg-primary/10 text-primary";
}

function exportAuditCsv(entries: AuditLogEntry[]): void {
  const headers = ["occurred_at", "actor", "action", "target_type", "target_repr", "ip_address"];
  const rows = entries.map((entry) => [
    entry.occurred_at,
    entry.actor_display_name ?? `Actor #${entry.actor_id ?? "unknown"}`,
    entry.action,
    entry.target_type,
    entry.target_repr ?? entry.target_id ?? "",
    entry.ip_address ?? "",
  ]);

  const csvContent = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function AuditPage(): JSX.Element {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const queryOptions = useMemo(
    () => ({
      cursor,
      "page[size]": 15,
      "filter[action]": actionFilter || undefined,
      "filter[target_type]": targetTypeFilter || undefined,
      "filter[actor]": actorFilter || undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
    }),
    [actionFilter, actorFilter, cursor, fromDate, targetTypeFilter, toDate],
  );

  const auditQuery = useQuery({
    queryKey: [QUERY_KEYS.auditLogs, queryOptions],
    queryFn: () => fetchAuditEntries(queryOptions),
  });

  // Query options for export (large page, no cursor, same filters)
  const exportQueryOptions = useMemo(
    () => ({
      "page[size]": 500,
      "filter[action]": actionFilter || undefined,
      "filter[target_type]": targetTypeFilter || undefined,
      "filter[actor]": actorFilter || undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
    }),
    [actionFilter, actorFilter, fromDate, targetTypeFilter, toDate],
  );

  async function handleExportCsv() {
    try {
      const result = await fetchAuditEntries(exportQueryOptions);
      exportAuditCsv(result.data);
      toast.success("Audit log exported");
    } catch {
      toast.error("Failed to export audit log.");
    }
  }

  const columns: ColumnDef<AuditLogEntry>[] = [
    {
      key: "occurred_at",
      header: "Occurred",
      accessor: (entry) => new Date(entry.occurred_at).toLocaleString(),
    },
    {
      key: "actor_display_name",
      header: "Actor",
      accessor: (entry) => entry.actor_display_name ?? `Actor #${entry.actor_id ?? "unknown"}`,
    },
    {
      key: "action",
      header: "Action",
      accessor: (entry) => (
        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${actionBadge(entry.action)}`}>
          {entry.action}
        </span>
      ),
    },
    {
      key: "target_type",
      header: "Target",
      accessor: (entry) => (
        <div>
          <div className="font-medium text-text">{entry.target_type}</div>
          <div className="text-xs text-muted">{entry.target_repr ?? entry.target_id ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "ip_address",
      header: "IP",
      accessor: (entry) => <span className="font-mono text-xs">{entry.ip_address ?? "—"}</span>,
    },
    {
      key: "actions",
      header: "",
      accessor: (entry) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            openDetail(entry);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  function openDetail(entry: AuditLogEntry) {
    navigate(`/admin/audit/${entry.id}`, { state: { entry } });
  }

  const pagination: CursorPagination = {
    mode: "cursor",
    cursor: auditQuery.data?.page.cursor,
    next: auditQuery.data?.page.next,
    prev: auditQuery.data?.page.prev,
    total: auditQuery.data?.page.total,
    pageSize: auditQuery.data?.page.size,
    onPageChange: setCursor,
  };

  return (
    <div className="space-y-4">
      {/* Date range row */}
      <div className="grid gap-3 rounded-2xl border border-primary/10 bg-surface p-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-muted">From date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(event) => {
              setCursor(undefined);
              setFromDate(event.target.value);
            }}
            className="w-full rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm text-text"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-muted">To date</label>
          <input
            type="date"
            value={toDate}
            onChange={(event) => {
              setCursor(undefined);
              setToDate(event.target.value);
            }}
            className="w-full rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm text-text"
          />
        </div>
      </div>

      {/* Filter + export row */}
      <div className="grid gap-3 rounded-2xl border border-primary/10 bg-surface p-4 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-muted">Action</label>
          <input
            value={actionFilter}
            onChange={(event) => {
              setCursor(undefined);
              setActionFilter(event.target.value);
            }}
            className="w-full rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm text-text"
            placeholder="e.g. device.create, platform.delete"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-muted">Target Type</label>
          <select
            value={targetTypeFilter}
            onChange={(event) => {
              setCursor(undefined);
              setTargetTypeFilter(event.target.value);
            }}
            className="w-full rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm text-text"
          >
            <option value="">All</option>
            {KNOWN_TARGET_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-muted">Actor</label>
          <input
            value={actorFilter}
            onChange={(event) => {
              setCursor(undefined);
              setActorFilter(event.target.value);
            }}
            className="w-full rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm text-text"
            placeholder="Username or actor name"
          />
        </div>
        <div className="flex items-end">
          <Button variant="outline" size="sm" onClick={handleExportCsv} className="w-full">
            Export CSV
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={auditQuery.data?.data ?? []}
        keyExtractor={(entry) => entry.id}
        pagination={pagination}
        onRowClick={(entry) => openDetail(entry)}
        isLoading={auditQuery.isLoading}
        isError={auditQuery.isError}
        errorMessage="Unable to load audit entries."
        onRetry={() => auditQuery.refetch()}
        dense
        emptyState={<p className="text-sm text-muted">No audit entries match the current filters.</p>}
      />
    </div>
  );
}
