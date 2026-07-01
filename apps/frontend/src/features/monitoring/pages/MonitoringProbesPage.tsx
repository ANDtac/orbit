import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef } from "@/components/ui/DataTable";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchJobs, queueProbe } from "@/features/monitoring/api/monitoring.api";
import { JobDetailPanel } from "@/components/JobDetailPanel";
import { QUERY_KEYS } from "@/lib/constants";
import type { Device, Job } from "@/lib/types";

const PROBE_TYPES = ["icmp", "ssh", "api", "config"];

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

export function MonitoringProbesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [search, setSearch] = useState("");
  const [probeType, setProbeType] = useState(PROBE_TYPES[0]);
  const [variablesText, setVariablesText] = useState("");
  const [variablesError, setVariablesError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const devicesQuery = useQuery({
    queryKey: [QUERY_KEYS.devices, "probe-selection", search],
    queryFn: () =>
      fetchDevices({
        "page[size]": 100,
        sort: "name",
        "filter[name]": search || undefined,
      }),
  });

  const probeJobsQuery = useQuery({
    queryKey: [QUERY_KEYS.monitoringProbeJobs],
    queryFn: () => fetchJobs({ "page[size]": 10, job_type: "device.probe*" }),
  });

  const probeMutation = useMutation({
    mutationFn: queueProbe,
    onSuccess: () => {
      setSelected(new Set());
      setVariablesText("");
      setVariablesError(null);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.monitoringProbeJobs] });
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.jobs] });
    },
  });

  const filteredDevices = devicesQuery.data?.data ?? [];

  const selectedDeviceIds = useMemo(
    () => Array.from(selected).map((value) => Number(value)).filter((value) => Number.isFinite(value)),
    [selected],
  );

  const deviceColumns: ColumnDef<Device>[] = [
    {
      key: "name",
      header: "Device",
      accessor: (device) => (
        <div>
          <div className="font-medium text-text">{device.name}</div>
          <div className="font-mono text-xs text-muted">{device.mgmt_ipv4 ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "platform_id",
      header: "Platform",
      accessor: (device) => String(device.platform_id ?? "—"),
    },
    {
      key: "os_name",
      header: "OS",
      accessor: (device) => device.os_name ?? "—",
    },
  ];

  const jobColumns: ColumnDef<Job>[] = [
    {
      key: "id",
      header: "Job",
      accessor: (job) => (
        <div>
          <div className="font-medium text-text">#{job.id}</div>
          <div className="font-mono text-xs text-muted">{job.job_type}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      accessor: (job) => (
        <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-text">
          <span className={`h-2 w-2 rounded-full ${jobStatusDot(job.status)}`} />
          {job.status}
        </span>
      ),
    },
    {
      key: "probe_type",
      header: "Probe",
      accessor: (job) => String(job.parameters?.probe_type ?? "—"),
    },
    {
      key: "created_at",
      header: "Queued",
      accessor: (job) => (job.timestamps.created_at ? new Date(job.timestamps.created_at).toLocaleString() : "—"),
    },
  ];

  async function handleQueueProbe() {
    setFormError(null);
    setVariablesError(null);
    let variables: Record<string, unknown> | undefined;

    if (variablesText.trim()) {
      try {
        variables = JSON.parse(variablesText) as Record<string, unknown>;
      } catch {
        setVariablesError("Variables must be valid JSON.");
        return;
      }
    }

    await probeMutation.mutateAsync({
      device_ids: selectedDeviceIds,
      probe_type: probeType,
      variables,
    });
  }

  function selectAllFiltered() {
    const allKeys = new Set<string | number>(filteredDevices.map((d) => d.id));
    setSelected(allKeys);
  }

  const jobId = probeMutation.isSuccess ? probeMutation.data.job.id : null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-primary/10 bg-surface p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <h3 className="font-heading text-xl text-primary">Queue a probe batch</h3>
            <p className="mt-1 text-sm text-muted">
              Select devices, choose a probe type, and enqueue a device probe job using the existing backend job flow.
            </p>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <label className="mb-1 block text-xs font-medium text-muted">Search devices</label>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Filter by device name"
                  className="w-full rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm text-text"
                />
              </div>
              <div className="min-w-[180px]">
                <label className="mb-1 block text-xs font-medium text-muted">
                  Probe type
                  <InfoTooltip text="Probes collect data from devices. The probe type determines what information is gathered." />
                </label>
                <select
                  value={probeType}
                  onChange={(event) => setProbeType(event.target.value)}
                  className="w-full rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm text-text"
                >
                  {PROBE_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-muted">
                Variables JSON
                <InfoTooltip text={'Optional JSON object passed to the probe. Example: {"interface": "GigabitEthernet0/1"}. Leave blank if the probe requires no parameters.'} />
              </label>
              <textarea
                value={variablesText}
                onChange={(event) => {
                  setVariablesText(event.target.value);
                  if (variablesError) setVariablesError(null);
                }}
                placeholder='{"timeout": 5}'
                rows={4}
                className="w-full rounded-2xl border border-primary/30 bg-background px-3 py-2 font-mono text-sm text-text"
              />
              {variablesError ? <p className="mt-1 text-xs text-red-500">{variablesError}</p> : null}
            </div>

            {formError ? <p className="mt-3 text-sm text-red-500">{formError}</p> : null}
            {probeMutation.isError ? (
              <p className="mt-3 text-sm text-red-500">Unable to queue the probe batch right now.</p>
            ) : null}
            {jobId != null ? (
              <p className="mt-3 text-sm text-emerald-600">
                Probe batch queued as{" "}
                <Link to="/automation/runs" className="font-medium underline hover:no-underline">
                  job #{jobId}
                </Link>
                .
              </p>
            ) : null}
          </div>

          <aside className="rounded-2xl border border-primary/10 bg-background/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Selection</p>
            <p className="mt-2 text-3xl font-heading text-primary">{selectedDeviceIds.length}</p>
            <p className="mt-1 text-sm text-muted">devices ready for the next probe run</p>
            <Button
              className="mt-4 w-full"
              onClick={() => void handleQueueProbe()}
              disabled={!selectedDeviceIds.length || probeMutation.isPending}
            >
              {probeMutation.isPending ? "Queueing…" : "Queue Probe Batch"}
            </Button>
          </aside>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-heading text-xl text-primary">Target devices</h3>
          {filteredDevices.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={selectAllFiltered}
            >
              Select all ({filteredDevices.length})
            </Button>
          ) : null}
        </div>
        <DataTable
          columns={deviceColumns}
          data={filteredDevices}
          keyExtractor={(device) => device.id}
          selection={{
            selected,
            onSelectionChange: setSelected,
          }}
          isLoading={devicesQuery.isLoading}
          isError={devicesQuery.isError}
          onRetry={() => devicesQuery.refetch()}
          errorMessage="Unable to load devices for probe selection."
          dense
          emptyState={<p className="text-sm text-muted">No devices match the current search.</p>}
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-heading text-xl text-primary">Recent probe jobs</h3>
        <DataTable
          columns={jobColumns}
          data={probeJobsQuery.data?.data ?? []}
          keyExtractor={(job) => job.id}
          expandable={{
            render: (job) => <JobDetailPanel job={job} deviceNames={{}} />,
          }}
          isLoading={probeJobsQuery.isLoading}
          isError={probeJobsQuery.isError}
          onRetry={() => probeJobsQuery.refetch()}
          errorMessage="Unable to load recent probe jobs."
          dense
          emptyState={<p className="text-sm text-muted">No probe jobs have been queued yet.</p>}
        />
      </section>
    </div>
  );
}

function jobStatusDot(status: Job["status"]): string {
  if (status === "succeeded" || status === "finished") return "bg-emerald-500";
  if (status === "failed" || status === "cancelled") return "bg-red-500";
  if (status === "running") return "bg-amber-400";
  return "bg-slate-400";
}
