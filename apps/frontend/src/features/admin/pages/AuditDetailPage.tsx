import { useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { QUERY_KEYS } from "@/lib/constants";
import type { AuditLogEntry } from "@/lib/types";

import { fetchAuditEntries } from "../api/admin.api";

function humanizeKey(key: string): string {
  return key
    .replace(/[_.]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function FieldRow({ label, value }: { label: string; value: unknown }): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-primary/5 py-2 sm:grid-cols-3">
      <dt className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="break-words text-sm text-text sm:col-span-2">{formatValue(value)}</dd>
    </div>
  );
}

/**
 * Render the audit payload in a readable form. When the payload carries
 * `before`/`after` snapshots we show a per-field change table; otherwise we
 * fall back to a labeled key/value list.
 */
function PayloadView({ payload }: { payload: Record<string, unknown> }): JSX.Element {
  const before = isRecord(payload.before) ? payload.before : null;
  const after = isRecord(payload.after) ? payload.after : null;

  if (before || after) {
    const keys = Array.from(
      new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
    );

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-primary/10 text-left text-xs uppercase tracking-[0.14em] text-muted">
              <th className="py-2 pr-4 font-medium">Field</th>
              <th className="py-2 pr-4 font-medium">Before</th>
              <th className="py-2 font-medium">After</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const beforeVal = before?.[key];
              const afterVal = after?.[key];
              const changed = formatValue(beforeVal) !== formatValue(afterVal);
              return (
                <tr key={key} className={`border-b border-primary/5 ${changed ? "bg-amber-500/5" : ""}`}>
                  <td className="py-2 pr-4 font-medium text-text">{humanizeKey(key)}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-muted">{formatValue(beforeVal)}</td>
                  <td className="py-2 font-mono text-xs text-text">{formatValue(afterVal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const entries = Object.entries(payload);
  if (entries.length === 0) {
    return <p className="text-sm text-muted">This entry has no recorded change details.</p>;
  }

  return (
    <dl>
      {entries.map(([key, value]) => (
        <FieldRow key={key} label={humanizeKey(key)} value={value} />
      ))}
    </dl>
  );
}

export function AuditDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const stateEntry = (location.state as { entry?: AuditLogEntry } | null)?.entry;

  // Fall back to fetching a page of entries and locating this id when the row
  // was not passed via navigation state (e.g. bookmarked / deep-linked).
  const fallbackQuery = useQuery({
    queryKey: [QUERY_KEYS.auditLogs, "detail", id],
    queryFn: () => fetchAuditEntries({ "page[size]": 500 }),
    enabled: !stateEntry && Boolean(id),
  });

  const entry = useMemo(() => {
    if (stateEntry) return stateEntry;
    return fallbackQuery.data?.data.find((row) => String(row.id) === id) ?? null;
  }, [stateEntry, fallbackQuery.data, id]);

  const isLoading = !stateEntry && fallbackQuery.isLoading;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/admin/audit")}>
        ← Back to audit log
      </Button>

      {isLoading ? (
        <p className="text-sm text-muted">Loading audit entry…</p>
      ) : !entry ? (
        <div className="rounded-2xl border border-primary/10 bg-surface p-6">
          <p className="text-sm text-text">Audit entry not found.</p>
          <p className="mt-1 text-sm text-muted">
            It may have aged out of the recent history. Return to the audit log to search with filters.
          </p>
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-primary/10 bg-surface p-6">
            <h2 className="font-heading text-lg text-primary">Summary</h2>
            <dl className="mt-3">
              <FieldRow label="Occurred" value={new Date(entry.occurred_at).toLocaleString()} />
              <FieldRow
                label="Actor"
                value={entry.actor_display_name ?? `Actor #${entry.actor_id ?? "unknown"}`}
              />
              <FieldRow label="Action" value={entry.action} />
              <FieldRow label="Target type" value={entry.target_type} />
              <FieldRow label="Target" value={entry.target_repr ?? entry.target_id ?? "—"} />
              <FieldRow label="IP address" value={entry.ip_address} />
              {entry.user_agent ? <FieldRow label="User agent" value={entry.user_agent} /> : null}
              {entry.message ? <FieldRow label="Message" value={entry.message} /> : null}
            </dl>
          </section>

          <section className="rounded-2xl border border-primary/10 bg-surface p-6">
            <h2 className="font-heading text-lg text-primary">Change details</h2>
            <div className="mt-3">
              <PayloadView payload={entry.payload ?? {}} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
