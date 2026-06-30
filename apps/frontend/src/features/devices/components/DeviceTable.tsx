import type { Device } from "@/lib/types";

interface DeviceTableProps {
  devices: Device[];
}

export function DeviceTable({ devices }: DeviceTableProps): JSX.Element {
  if (!devices.length) {
    return <p className="text-muted">No devices found. Connect a controller to start syncing inventory.</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-primary/10">
      <table className="min-w-full divide-y divide-primary/10">
        <thead className="bg-primary/10">
          <tr>
            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-primary">
              Device Name
            </th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-primary">
              Management IP
            </th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-primary">
              OS
            </th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-primary">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-primary/5 bg-surface">
          {devices.map((device) => (
            <tr key={device.id} className="transition hover:bg-primary/5">
              <td className="px-4 py-3 text-sm font-medium text-text">
                <div>{device.name}</div>
                {device.fqdn && <div className="text-xs text-muted">{device.fqdn}</div>}
              </td>
              <td className="px-4 py-3 font-mono text-sm text-text">
                {device.mgmt_ipv4 ?? "—"}
              </td>
              <td className="px-4 py-3 text-sm text-text">
                {device.os_name ?? "—"}
                {device.os_version && (
                  <span className="ml-1 text-xs text-muted">{device.os_version}</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                    device.is_active !== false
                      ? "bg-green-500/10 text-green-600"
                      : "bg-red-500/10 text-red-600"
                  }`}
                >
                  {device.is_active !== false ? "Active" : "Inactive"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
