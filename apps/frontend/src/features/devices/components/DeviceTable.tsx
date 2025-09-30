import { formatDistanceToNow } from "date-fns";

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
              Hostname
            </th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-primary">
              Platform
            </th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-primary">
              Status
            </th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-primary">
              Site
            </th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-primary">
              Last seen
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-primary/5 bg-surface">
          {devices.map((device) => (
            <tr key={device.id} className="transition hover:bg-primary/5">
              <td className="px-4 py-3 text-sm font-medium text-text">{device.hostname}</td>
              <td className="px-4 py-3 text-sm text-text">{device.platform}</td>
              <td className="px-4 py-3 text-sm">
                <span
                  className="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-wide"
                  data-status={device.status}
                >
                  {device.status}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-text">{device.site ?? "—"}</td>
              <td className="px-4 py-3 text-sm text-text">
                {formatDistanceToNow(new Date(device.lastSeen), { addSuffix: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
