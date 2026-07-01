import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { fetchAppEvents, fetchErrorLogs, fetchRequestLogs } from "@/features/monitoring/api/monitoring.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { AppEventEntry, ErrorLogEntry, RequestLogEntry } from "@/lib/types";

const PAGE_SIZE = 25;

type LogTab = "requests" | "errors" | "events";

const TAB_IDS: Record<LogTab, string> = {
  requests: "tab-requests",
  errors: "tab-errors",
  events: "tab-events",
};

const PANEL_IDS: Record<LogTab, string> = {
  requests: "panel-requests",
  errors: "panel-errors",
  events: "panel-events",
};

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

function statusColor(code: number): string {
  if (code < 400) return "text-emerald-600";
  if (code < 500) return "text-amber-500";
  return "text-red-500";
}

function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

export function MonitoringLogsPage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<LogTab>("requests");
  const [requestPage, setRequestPage] = useState(1);
  const [errorPage, setErrorPage] = useState(1);
  const [eventPage, setEventPage] = useState(1);

  // Date range filters
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Text search filters
  const [searchText, setSearchText] = useState("");

  // Read-only detail modal for a single log record
  const [detailRecord, setDetailRecord] = useState<Record<string, unknown> | null>(null);
  const [detailTitle, setDetailTitle] = useState("");

  // Date range params are sent to the API so filtering is server-side across all
  // pages, not just the rows currently loaded. `to` is inclusive-to-end-of-day.
  const dateParams = useMemo(
    () => ({ from: fromDate || undefined, to: toDate || undefined }),
    [fromDate, toDate],
  );

  const {
    data: requestLogs = [],
    isLoading: requestLoading,
    isError: requestError,
    refetch: refetchRequests,
  } = useQuery({
    queryKey: [QUERY_KEYS.requestLogs, requestPage, dateParams],
    queryFn: () => fetchRequestLogs({ page: requestPage, per_page: PAGE_SIZE, ...dateParams }),
  });

  const {
    data: errorLogs = [],
    isLoading: errorLoading,
    isError: errorError,
    refetch: refetchErrors,
  } = useQuery({
    queryKey: [QUERY_KEYS.errorLogs, errorPage, dateParams],
    queryFn: () => fetchErrorLogs({ page: errorPage, per_page: PAGE_SIZE, ...dateParams }),
  });

  const {
    data: appEvents = [],
    isLoading: eventLoading,
    isError: eventError,
    refetch: refetchEvents,
  } = useQuery({
    queryKey: [QUERY_KEYS.appEvents, eventPage, dateParams],
    queryFn: () => fetchAppEvents({ page: eventPage, per_page: PAGE_SIZE, ...dateParams }),
  });

  // Date filtering is handled server-side; only the free-text search runs client-side.
  const filteredRequests = useMemo(() => {
    if (!searchText) return requestLogs;
    const q = searchText.toLowerCase();
    return requestLogs.filter((r) => r.path.toLowerCase().includes(q) || r.method.toLowerCase().includes(q));
  }, [requestLogs, searchText]);

  const filteredErrors = useMemo(() => {
    if (!searchText) return errorLogs;
    const q = searchText.toLowerCase();
    return errorLogs.filter((r) => r.message.toLowerCase().includes(q));
  }, [errorLogs, searchText]);

  const filteredEvents = useMemo(() => {
    if (!searchText) return appEvents;
    const q = searchText.toLowerCase();
    return appEvents.filter(
      (r) => r.event.toLowerCase().includes(q) || (r.message ?? "").toLowerCase().includes(q),
    );
  }, [appEvents, searchText]);

  const requestColumns: ColumnDef<RequestLogEntry>[] = [
    {
      key: "method_path",
      header: "Method / Path",
      accessor: (entry) => (
        <div>
          <span className="font-mono text-xs font-semibold text-primary">{entry.method}</span>
          <span className="ml-2 text-xs text-text">{entry.path}</span>
        </div>
      ),
    },
    {
      key: "status_code",
      header: "Status",
      accessor: (entry) => (
        <span className={`font-mono text-xs font-semibold ${statusColor(entry.status_code)}`}>
          {entry.status_code}
        </span>
      ),
    },
    {
      key: "latency_ms",
      header: "Duration",
      accessor: (entry) => (
        <span className="font-mono text-xs text-muted">{formatLatency(entry.latency_ms)}</span>
      ),
    },
    {
      key: "created_at",
      header: "When",
      accessor: (entry) => <span className="text-xs text-muted">{formatRelative(entry.created_at)}</span>,
    },
  ];

  const errorColumns: ColumnDef<ErrorLogEntry>[] = [
    {
      key: "level",
      header: "Level",
      accessor: (entry) => (
        <span
          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
            entry.level === "ERROR" || entry.level === "error"
              ? "bg-red-500/10 text-red-600"
              : entry.level === "WARNING" || entry.level === "warning"
                ? "bg-amber-500/10 text-amber-600"
                : "bg-slate-500/10 text-slate-500"
          }`}
        >
          {entry.level}
        </span>
      ),
    },
    {
      key: "message",
      header: "Message",
      accessor: (entry) => <span className="text-sm text-text">{entry.message}</span>,
    },
    {
      key: "correlation_id",
      header: "Correlation ID",
      accessor: (entry) => (
        <span className="inline-flex items-center font-mono text-xs text-muted">
          {entry.correlation_id}
          <InfoTooltip text="Share this ID with your engineering team when reporting this issue." />
        </span>
      ),
    },
    {
      key: "created_at",
      header: "When",
      accessor: (entry) => <span className="text-xs text-muted">{formatRelative(entry.created_at)}</span>,
    },
  ];

  const eventColumns: ColumnDef<AppEventEntry>[] = [
    {
      key: "event_level",
      header: "Event / Level",
      accessor: (entry) => (
        <div>
          <div className="font-medium text-text">{entry.event}</div>
          <div className="text-xs uppercase text-muted">{entry.level}</div>
        </div>
      ),
    },
    {
      key: "message",
      header: "Message",
      accessor: (entry) => <span className="text-sm text-text">{entry.message ?? "—"}</span>,
    },
    {
      key: "created_at",
      header: "When",
      accessor: (entry) => <span className="text-xs text-muted">{formatRelative(entry.created_at)}</span>,
    },
  ];

  function handleTabChange(tab: LogTab) {
    setActiveTab(tab);
    setSearchText("");
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Log categories"
        className="inline-flex rounded-full border border-primary/10 bg-surface p-1"
      >
        {(["requests", "errors", "events"] as LogTab[]).map((tab) => (
          <button
            key={tab}
            id={TAB_IDS[tab]}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={PANEL_IDS[tab]}
            onClick={() => handleTabChange(tab)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === tab ? "bg-primary text-white" : "text-text hover:bg-primary/10"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="logs-from-date" className="mb-1 block text-xs font-medium text-muted">From</label>
          <input
            id="logs-from-date"
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setRequestPage(1);
              setErrorPage(1);
              setEventPage(1);
            }}
            className="rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm text-text"
          />
        </div>
        <div>
          <label htmlFor="logs-to-date" className="mb-1 block text-xs font-medium text-muted">To</label>
          <input
            id="logs-to-date"
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setRequestPage(1);
              setErrorPage(1);
              setEventPage(1);
            }}
            className="rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm text-text"
          />
        </div>
        <div className="min-w-[240px] flex-1">
          <label htmlFor="logs-search" className="mb-1 block text-xs font-medium text-muted">Search</label>
          <input
            id="logs-search"
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={
              activeTab === "requests"
                ? "Filter by path or method…"
                : activeTab === "errors"
                  ? "Filter by message…"
                  : "Filter by event or message…"
            }
            className="w-full rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm text-text"
          />
        </div>
      </div>

      <div
        id={PANEL_IDS.requests}
        role="tabpanel"
        aria-labelledby={TAB_IDS.requests}
        hidden={activeTab !== "requests"}
      >
        {activeTab === "requests" ? (
          <div className="space-y-3">
            <h3 className="font-heading text-xl text-primary">Request logs</h3>
            <DataTable
              columns={requestColumns}
              data={filteredRequests}
              keyExtractor={(entry) => entry.id}
              onRowClick={(entry) => {
                setDetailTitle(`${entry.method} ${entry.path}`);
                setDetailRecord(entry as unknown as Record<string, unknown>);
              }}
              isLoading={requestLoading}
              isError={requestError}
              onRetry={() => refetchRequests()}
              errorMessage="Unable to load request logs."
              dense
              emptyState={<p className="text-sm text-muted">No request logs match the current filters.</p>}
            />
            <PaginationControls
              page={requestPage}
              hasMore={requestLogs.length >= PAGE_SIZE}
              onPrevious={() => setRequestPage((page) => Math.max(1, page - 1))}
              onNext={() => setRequestPage((page) => page + 1)}
            />
          </div>
        ) : null}
      </div>

      <div
        id={PANEL_IDS.errors}
        role="tabpanel"
        aria-labelledby={TAB_IDS.errors}
        hidden={activeTab !== "errors"}
      >
        {activeTab === "errors" ? (
          <div className="space-y-3">
            <h3 className="font-heading text-xl text-primary">Error logs</h3>
            <DataTable
              columns={errorColumns}
              data={filteredErrors}
              keyExtractor={(entry) => entry.id}
              onRowClick={(entry) => {
                setDetailTitle(`${entry.level} · ${entry.correlation_id}`);
                setDetailRecord(entry as unknown as Record<string, unknown>);
              }}
              isLoading={errorLoading}
              isError={errorError}
              onRetry={() => refetchErrors()}
              errorMessage="Unable to load error logs."
              dense
              emptyState={<p className="text-sm text-muted">No error logs match the current filters.</p>}
            />
            <PaginationControls
              page={errorPage}
              hasMore={errorLogs.length >= PAGE_SIZE}
              onPrevious={() => setErrorPage((page) => Math.max(1, page - 1))}
              onNext={() => setErrorPage((page) => page + 1)}
            />
          </div>
        ) : null}
      </div>

      <div
        id={PANEL_IDS.events}
        role="tabpanel"
        aria-labelledby={TAB_IDS.events}
        hidden={activeTab !== "events"}
      >
        {activeTab === "events" ? (
          <div className="space-y-3">
            <h3 className="font-heading text-xl text-primary">Application events</h3>
            <DataTable
              columns={eventColumns}
              data={filteredEvents}
              keyExtractor={(entry) => entry.id}
              onRowClick={(entry) => {
                setDetailTitle(entry.event);
                setDetailRecord(entry as unknown as Record<string, unknown>);
              }}
              isLoading={eventLoading}
              isError={eventError}
              onRetry={() => refetchEvents()}
              errorMessage="Unable to load application events."
              dense
              emptyState={<p className="text-sm text-muted">No application events match the current filters.</p>}
            />
            <PaginationControls
              page={eventPage}
              hasMore={appEvents.length >= PAGE_SIZE}
              onPrevious={() => setEventPage((page) => Math.max(1, page - 1))}
              onNext={() => setEventPage((page) => page + 1)}
            />
          </div>
        ) : null}
      </div>

      <Modal
        isOpen={detailRecord !== null}
        onClose={() => setDetailRecord(null)}
        title={detailTitle || "Log entry"}
        size="lg"
        footer={
          <Button variant="ghost" onClick={() => setDetailRecord(null)}>
            Close
          </Button>
        }
      >
        {detailRecord ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {Object.entries(detailRecord).map(([key, value]) => (
              <div key={key} className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{key}</dt>
                <dd className="mt-0.5 break-words font-mono text-sm text-text">{formatFieldValue(value)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Modal>
    </div>
  );
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function PaginationControls({
  page,
  hasMore,
  onPrevious,
  onNext,
}: {
  page: number;
  hasMore: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" onClick={onPrevious} disabled={page === 1}>
        Previous
      </Button>
      <Button variant="ghost" onClick={onNext} disabled={!hasMore}>
        Next
      </Button>
    </div>
  );
}

function formatRelative(value?: string): string {
  return value ? formatDistanceToNow(new Date(value), { addSuffix: true }) : "—";
}
