import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { QUERY_KEYS } from "@/lib/constants";
import { useAuth } from "@/hooks/useAuth";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchInventoryGroups } from "@/features/devices/api/groups.api";
import { fetchPlatforms } from "@/features/devices/api/platforms.api";
import { fetchCredentialProfiles } from "@/features/devices/api/credentialProfiles.api";
import { DeviceSelectionTable } from "../components/DeviceSelectionTable";
import { PasswordChangeForm } from "../components/PasswordChangeForm";
import { PasswordChangeProgress } from "../components/PasswordChangeProgress";
import { fetchOperationJob, startPasswordChange } from "../api/automation.api";
import type { Device, PasswordChangeResult } from "@/lib/types";

// TODO: Add 'Validate connectivity' step before credentials that tests SSH connection to selected devices
// without changing passwords. Requires backend dry-run endpoint.

type Step = "select" | "credentials" | "executing" | "complete";

const CONFIRM_PHRASE = "CHANGE";

function isTerminalStatus(status?: string): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function extractResults(jobResults: Array<Record<string, unknown>> | undefined, taskResults: Array<Record<string, unknown>>): PasswordChangeResult[] {
  if (jobResults?.length) {
    return jobResults as unknown as PasswordChangeResult[];
  }

  return taskResults.map((result) => ({
    device_id: Number(result.device_id ?? 0),
    ok: Boolean(result.ok ?? false),
    changed: Boolean(result.changed ?? false),
    output: (result.output as string | undefined) ?? null,
    error: (result.error as string | undefined) ?? null,
    phase: (result.phase as string | undefined) ?? "completed",
    platform: (result.platform as string | undefined) ?? null,
    host: (result.host as string | undefined) ?? null,
  }));
}

export function PasswordChangePage(): JSX.Element {
  const { hasSessionPassword } = useAuth();
  const [step, setStep] = useState<Step>("select");
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [platformFilter, setPlatformFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("true");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [completedResults, setCompletedResults] = useState<PasswordChangeResult[]>([]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const devicesQuery = useQuery({
    queryKey: [QUERY_KEYS.devices, "password-change", platformFilter, groupFilter, activeFilter],
    queryFn: () =>
      fetchDevices({
        "page[size]": 200,
        sort: "name",
        ...(platformFilter ? { "filter[platform_id]": Number(platformFilter) } : {}),
        ...(groupFilter ? { "filter[inventory_group_id]": Number(groupFilter) } : {}),
        ...(activeFilter ? { "filter[is_active]": activeFilter } : {}),
      }),
  });

  const platformsQuery = useQuery({
    queryKey: [QUERY_KEYS.platforms],
    queryFn: fetchPlatforms,
  });

  const groupsQuery = useQuery({
    queryKey: [QUERY_KEYS.inventoryGroups],
    queryFn: fetchInventoryGroups,
  });

  const credentialProfilesQuery = useQuery({
    queryKey: [QUERY_KEYS.credentialProfiles],
    queryFn: fetchCredentialProfiles,
  });

  const selectedDevices = useMemo(() => {
    const data = devicesQuery.data?.data ?? [];
    return data.filter((device) => selectedIds.has(device.id));
  }, [devicesQuery.data?.data, selectedIds]);

  const platformNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const platform of platformsQuery.data ?? []) {
      map.set(platform.id, platform.display_name);
    }
    return map;
  }, [platformsQuery.data]);

  const credentialProfileNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const profile of credentialProfilesQuery.data ?? []) {
      map.set(profile.id, profile.name);
    }
    return map;
  }, [credentialProfilesQuery.data]);

  const displayDevices = useMemo(() => {
    return (devicesQuery.data?.data ?? []).map((device) => ({
      ...device,
      os_name: platformNames.get(device.platform_id ?? -1) ?? device.os_name,
    }));
  }, [devicesQuery.data?.data, platformNames]);

  const platformSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const device of selectedDevices) {
      const label = platformNames.get(device.platform_id ?? -1) ?? device.os_name ?? "Unknown";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].map(([label, count]) => `${label} (${count})`);
  }, [platformNames, selectedDevices]);

  const mutation = useMutation({
    mutationFn: startPasswordChange,
  });

  const jobQuery = useQuery({
    queryKey: [QUERY_KEYS.operationsPasswordChangeJob, jobId],
    queryFn: () => fetchOperationJob(jobId as number),
    enabled: step === "executing" && jobId !== null,
    refetchInterval: (query) => (isTerminalStatus(query.state.data?.status) ? false : 2000),
  });

  useEffect(() => {
    if (!jobQuery.data || !isTerminalStatus(jobQuery.data.status)) {
      return;
    }

    const results = extractResults(
      (jobQuery.data.result?.results as Array<Record<string, unknown>> | undefined) ?? undefined,
      jobQuery.data.tasks
        .map((task) => task.result)
        .filter((item): item is Record<string, unknown> => Boolean(item)),
    );
    setCompletedResults(results);
    setStep("complete");

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    if (failed === 0) {
      toast.success(`Password change complete — ${succeeded} device${succeeded !== 1 ? "s" : ""} updated.`);
    } else if (succeeded === 0) {
      toast.error(`Password change failed — ${failed} device${failed !== 1 ? "s" : ""} encountered errors.`);
    } else {
      toast.success(`Password change complete — ${succeeded} succeeded, ${failed} failed.`);
    }
  }, [jobQuery.data]);

  const currentResults = useMemo(() => {
    if (completedResults.length) {
      return completedResults;
    }
    if (!jobQuery.data) {
      return selectedDevices.map((device) => ({
        device_id: device.id,
        ok: false,
        changed: false,
        phase: "pending",
        platform: platformNames.get(device.platform_id ?? -1) ?? device.os_name ?? "Unknown",
        host: device.mgmt_ipv4 ?? device.fqdn ?? device.name,
      }));
    }
    return extractResults(
      (jobQuery.data.result?.results as Array<Record<string, unknown>> | undefined) ?? undefined,
      jobQuery.data.tasks
        .map((task) => task.result)
        .filter((item): item is Record<string, unknown> => Boolean(item)),
    );
  }, [completedResults, jobQuery.data, platformNames, selectedDevices]);

  async function handleStartPasswordChange() {
    try {
      const response = await mutation.mutateAsync({
        device_ids: [...selectedIds].map(Number),
        current_password: currentPassword || undefined,
        new_password: newPassword,
        async: true,
        validate_after: true,
      });

      if (response.job) {
        setJobId(response.job.id);
        setCompletedResults([]);
        setStep("executing");
        return;
      }

      setCompletedResults(response.results ?? []);
      setStep("complete");

      const results = response.results ?? [];
      const succeeded = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok).length;
      if (failed === 0) {
        toast.success(`Password change complete — ${succeeded} device${succeeded !== 1 ? "s" : ""} updated.`);
      } else {
        toast.error(`Password change finished with ${failed} failure${failed !== 1 ? "s" : ""}.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start password change.";
      toast.error(msg);
    }
  }

  function handleOpenConfirmation() {
    if (!selectedIds.size) {
      setFormError("Select at least one device.");
      setStep("select");
      return;
    }
    if (!newPassword || !confirmNewPassword) {
      setFormError("Provide the new password twice before continuing.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setFormError("New password and confirmation must match.");
      return;
    }
    if (!currentPassword && !hasSessionPassword) {
      setFormError("Enter the current password or sign in again so Orbit can use your session password.");
      return;
    }
    setFormError(null);
    setIsConfirmOpen(true);
  }

  function handleRetryFailed() {
    const failedIds = currentResults.filter((result) => !result.ok).map((result) => result.device_id);
    setSelectedIds(new Set(failedIds));
    setConfirmation("");
    setCompletedResults([]);
    setJobId(null);
    setStep("credentials");
  }

  function handleRetryDevice(deviceId: number) {
    setSelectedIds(new Set([deviceId]));
    setConfirmation("");
    setCompletedResults([]);
    setJobId(null);
    setStep("credentials");
  }

  return (
    <div className="space-y-6">
      {step === "select" ? (
        <>
          <section className="grid gap-4 rounded-2xl border border-primary/10 bg-surface p-6 shadow-sm md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">Platform</span>
              <select
                value={platformFilter}
                onChange={(event) => setPlatformFilter(event.target.value)}
                className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-text"
              >
                <option value="">All platforms</option>
                {(platformsQuery.data ?? []).map((platform) => (
                  <option key={platform.id} value={platform.id}>
                    {platform.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">Group</span>
              <select
                value={groupFilter}
                onChange={(event) => setGroupFilter(event.target.value)}
                className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-text"
              >
                <option value="">All groups</option>
                {(groupsQuery.data ?? []).map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">Device Status</span>
              <select
                value={activeFilter}
                onChange={(event) => setActiveFilter(event.target.value)}
                className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-text"
              >
                <option value="">All devices</option>
                <option value="true">Active only</option>
                <option value="false">Inactive only</option>
              </select>
            </label>
          </section>

          <DeviceSelectionTable
            devices={displayDevices}
            platformNames={platformNames}
            credentialProfileNames={credentialProfileNames}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            isLoading={devicesQuery.isLoading}
          />

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Select one or more devices to continue.
            </p>
            <Button onClick={() => setStep("credentials")} disabled={!selectedIds.size}>
              Next
            </Button>
          </div>
        </>
      ) : null}

      {step === "credentials" ? (
        <PasswordChangeForm
          currentPassword={currentPassword}
          newPassword={newPassword}
          confirmNewPassword={confirmNewPassword}
          onCurrentPasswordChange={setCurrentPassword}
          onNewPasswordChange={setNewPassword}
          onConfirmNewPasswordChange={setConfirmNewPassword}
          onBack={() => setStep("select")}
          onContinue={handleOpenConfirmation}
          selectedCount={selectedIds.size}
          platformSummary={platformSummary}
          canUseSessionPassword={hasSessionPassword}
          isSubmitting={mutation.isPending}
          error={formError}
        />
      ) : null}

      {step === "executing" ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-5 py-4">
          <p className="text-sm font-medium text-amber-600">
            Note: Once started, a password change job cannot be cancelled. Monitor progress below.
          </p>
          {/* TODO: Add cancel button that calls job cancellation API endpoint (POST /api/v1/jobs/{id}/cancel) once backend supports it */}
        </div>
      ) : null}

      {step === "executing" || step === "complete" ? (
        <PasswordChangeProgress
          results={currentResults}
          devices={displayDevices}
          isPolling={step === "executing" && !isTerminalStatus(jobQuery.data?.status)}
          onRetryFailed={step === "complete" ? handleRetryFailed : undefined}
          onRetryDevice={step === "complete" ? handleRetryDevice : undefined}
        />
      ) : null}

      {step === "complete" ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-surface p-6 shadow-sm">
          <div>
            <h3 className="font-heading text-xl text-primary">Batch complete</h3>
            <p className="mt-1 text-sm text-muted">
              {currentResults.filter((result) => result.ok).length} succeeded,{" "}
              {currentResults.filter((result) => !result.ok).length} failed.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setSelectedIds(new Set());
              setCurrentPassword("");
              setNewPassword("");
              setConfirmNewPassword("");
              setConfirmation("");
              setCompletedResults([]);
              setJobId(null);
              setStep("select");
            }}
          >
            Start another batch
          </Button>
        </div>
      ) : null}

      <Modal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        title="Confirm password change"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await handleStartPasswordChange();
                setIsConfirmOpen(false);
                setConfirmation("");
              }}
              disabled={confirmation.trim().toUpperCase() !== CONFIRM_PHRASE || mutation.isPending}
            >
              {mutation.isPending ? "Starting…" : "Confirm and start"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text">
            This action changes passwords on {selectedIds.size} devices. Type{" "}
            <strong>{CONFIRM_PHRASE}</strong> to continue.
          </p>
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-text"
            aria-label={`Type ${CONFIRM_PHRASE} to confirm`}
          />
        </div>
      </Modal>
    </div>
  );
}
