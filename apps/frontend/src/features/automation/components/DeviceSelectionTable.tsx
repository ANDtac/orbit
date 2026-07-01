import { DataTable } from "@/components/ui/DataTable";
import type { Device } from "@/lib/types";

interface DeviceSelectionTableProps {
  devices: Device[];
  platformNames?: Map<number, string>;
  credentialProfileNames?: Map<number, string>;
  selectedIds: Set<string | number>;
  onSelectedIdsChange: (next: Set<string | number>) => void;
  isLoading?: boolean;
}

export function DeviceSelectionTable({
  devices,
  platformNames,
  credentialProfileNames,
  selectedIds,
  onSelectedIdsChange,
  isLoading = false,
}: DeviceSelectionTableProps): JSX.Element {
  return (
    <DataTable<Device>
      columns={[
        {
          key: "name",
          header: "Device",
          sortable: true,
          accessor: (device) => (
            <div>
              <div className="font-medium text-text">{device.name}</div>
              <div className="text-xs text-muted">{device.fqdn ?? "No FQDN"}</div>
            </div>
          ),
        },
        {
          key: "mgmt_ipv4",
          header: "IP Address",
          accessor: (device) => (
            <span className="font-mono text-xs text-text">
              {device.mgmt_ipv4 ?? "Unassigned"}
            </span>
          ),
        },
        {
          key: "platform_id",
          header: "Platform",
          accessor: (device) => platformNames?.get(device.platform_id ?? -1) ?? device.os_name ?? "Unknown",
        },
        {
          key: "credential_profile_id",
          header: "Credential Profile",
          accessor: (device) =>
            credentialProfileNames?.get(device.credential_profile_id ?? -1) ??
            device.credential_profile_id ??
            "None",
        },
      ]}
      data={devices}
      keyExtractor={(device) => device.id}
      selection={{
        selected: selectedIds,
        onSelectionChange: onSelectedIdsChange,
      }}
      isLoading={isLoading}
      dense
      stickyHeader
      emptyState={<p className="text-sm text-muted">No devices matched the current filters.</p>}
    />
  );
}
