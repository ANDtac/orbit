import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef, OffsetPagination, SelectionConfig } from "@/components/ui/DataTable";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { DeviceConfigSnapshot } from "@/lib/types";

import { fetchSnapshots } from "../api/operations.api";
import { SnapshotDiffModal } from "../components/SnapshotDiffModal";

const PER_PAGE = 14;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function snapshotSize(snapshot: DeviceConfigSnapshot): string {
  return formatSize(new TextEncoder().encode(snapshot.config_text).length);
}

function snapshotLabel(snapshot: DeviceConfigSnapshot, deviceName: string): string {
  return `${deviceName} · ${new Date(snapshot.captured_at).toLocaleString()}`;
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

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

// ─── Download helper ──────────────────────────────────────────────────────────

function downloadSnapshot(snapshot: DeviceConfigSnapshot, deviceName: string): void {
  const blob = new Blob([snapshot.config_text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${deviceName}_${snapshot.captured_at.split("T")[0]}.cfg`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SnapshotsPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [deviceFilter, setDeviceFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [activeSnapshotId, setActiveSnapshotId] = useState<number | null>(null);
  const [isDiffOpen, setIsDiffOpen] = useState(false);

  const queryOptions = useMemo(
    () => ({
      page,
      per_page: PER_PAGE,
      sort: "-captured_at",
      device_id: deviceFilter ? Number(deviceFilter) : undefined,
      source: sourceFilter || undefined,
    }),
    [page, deviceFilter, sourceFilter],
  );

  const { data: snapshots = [], isLoading, isError, refetch } = useQuery({
    queryKey: [QUERY_KEYS.operationSnapshots, queryOptions],
    queryFn: () => fetchSnapshots(queryOptions),
  });

  const { data: devicesResponse } = useQuery({
    queryKey: [QUERY_KEYS.devices, "snapshots-device-map"],
    queryFn: () => fetchDevices({ "page[size]": 200, sort: "name" }),
    staleTime: 5 * 60 * 1000,
  });

  const devices = devicesResponse?.data ?? [];

  const deviceNames = useMemo(
    () =>
      devices.reduce<Record<number, string>>((acc, device) => {
        acc[device.id] = device.name;
        return acc;
      }, {}),
    [devices],
  );

  useEffect(() => {
    if (!snapshots.length) {
      setActiveSnapshotId(null);
      return;
    }
    if (!snapshots.some((snapshot) => snapshot.id === activeSnapshotId)) {
      setActiveSnapshotId(snapshots[0].id);
    }
  }, [snapshots, activeSnapshotId]);

  const activeSnapshot =
    snapshots.find((snapshot) => snapshot.id === activeSnapshotId) ?? snapshots[0] ?? null;

  const selectedSnapshots = snapshots.filter((snapshot) => selected.has(snapshot.id));

  const columns: ColumnDef<DeviceConfigSnapshot>[] = [
    {
      key: "device_id",
      header: "Device",
      accessor: (snapshot) => deviceNames[snapshot.device_id] ?? `Device #${snapshot.device_id}`,
    },
    {
      key: "source",
      header: "Source",
      accessor: (snapshot) => (
        <span className="inline-flex rounded-full border border-primary/20 px-2 py-1 font-mono text-xs text-primary">
          {snapshot.source ?? "unknown"}
        </span>
      ),
    },
    {
      key: "config_hash",
      header: (
        <span className="inline-flex items-center">
          Hash
          <InfoTooltip text="A fingerprint of the configuration content. Identical hashes mean identical content — useful for detecting when a device config has changed." />
        </span>
      ) as unknown as string,
      accessor: (snapshot) => <span className="font-mono text-xs">{snapshot.config_hash ?? "—"}</span>,
    },
    {
      key: "size",
      header: "Size",
      accessor: (snapshot) => snapshotSize(snapshot),
    },
    {
      key: "captured_at",
      header: "Captured",
      accessor: (snapshot) => new Date(snapshot.captured_at).toLocaleString(),
    },
  ];

  const pagination: OffsetPagination = {
    mode: "offset",
    page,
    perPage: PER_PAGE,
    hasMore: snapshots.length === PER_PAGE,
    onPageChange: (nextPage) => {
      setSelected(new Set());
      setPage(nextPage);
    },
  };

  const selection: SelectionConfig = {
    selected,
    onSelectionChange: setSelected,
  };

  const activeDeviceName = activeSnapshot
    ? deviceNames[activeSnapshot.device_id] ?? `Device #${activeSnapshot.device_id}`
    : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <label className="mb-1 block text-xs font-medium text-muted">Device</label>
            <select
              value={deviceFilter}
              onChange={(event) => {
                setPage(1);
                setSelected(new Set());
                setDeviceFilter(event.target.value);
              }}
              className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
            >
              <option value="">All devices</option>
              {devices.map((device) => (
                <option key={device.id} value={String(device.id)}>
                  {device.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[220px]">
            <label className="mb-1 flex items-center text-xs font-medium text-muted">
              Source
              <InfoTooltip text="The method used to capture this configuration. Common values: napalm:get_config, netmiko:send_command. Leave blank to show all sources." />
            </label>
            <input
              value={sourceFilter}
              onChange={(event) => {
                setPage(1);
                setSelected(new Set());
                setSourceFilter(event.target.value);
              }}
              className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
              placeholder="napalm:get_config"
            />
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => setIsDiffOpen(true)}
          disabled={selectedSnapshots.length !== 2}
        >
          Compare 2 selected
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={snapshots}
        keyExtractor={(snapshot) => snapshot.id}
        pagination={pagination}
        selection={selection}
        isLoading={isLoading}
        isError={isError}
        errorMessage="Unable to load configuration snapshots."
        onRetry={() => refetch()}
        onRowClick={(snapshot) => setActiveSnapshotId(snapshot.id)}
        dense
        emptyState={<p className="text-sm text-muted">No configuration snapshots match the current filters.</p>}
      />

      {activeSnapshot ? (
        <section className="rounded-2xl border border-primary/10 bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Snapshot Preview</p>
              <h3 className="mt-1 text-lg font-semibold text-text">
                {snapshotLabel(activeSnapshot, activeDeviceName)}
              </h3>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right text-xs text-muted">
                <div>{activeSnapshot.source ?? "unknown source"}</div>
                <div className="font-mono">{activeSnapshot.config_hash ?? `snapshot-${activeSnapshot.id}`}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadSnapshot(activeSnapshot, activeDeviceName)}
              >
                Download
              </Button>
            </div>
          </div>

          <pre className="mt-4 max-h-[28rem] overflow-auto rounded-xl border border-primary/10 bg-background/60 p-4 font-mono text-xs text-text">
            {activeSnapshot.config_text}
          </pre>
        </section>
      ) : null}

      <SnapshotDiffModal
        isOpen={isDiffOpen}
        left={selectedSnapshots[0] ?? null}
        right={selectedSnapshots[1] ?? null}
        leftLabel={
          selectedSnapshots[0]
            ? snapshotLabel(
                selectedSnapshots[0],
                deviceNames[selectedSnapshots[0].device_id] ?? `Device #${selectedSnapshots[0].device_id}`,
              )
            : ""
        }
        rightLabel={
          selectedSnapshots[1]
            ? snapshotLabel(
                selectedSnapshots[1],
                deviceNames[selectedSnapshots[1].device_id] ?? `Device #${selectedSnapshots[1].device_id}`,
              )
            : ""
        }
        onClose={() => setIsDiffOpen(false)}
      />
    </div>
  );
}
