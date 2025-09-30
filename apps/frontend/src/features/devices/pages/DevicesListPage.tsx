import { useQuery } from "@tanstack/react-query";

import { DeviceTable } from "../components/DeviceTable";
import { fetchDevices } from "../api/devices.api";
import { QUERY_KEYS } from "@/lib/constants";

export function DevicesListPage(): JSX.Element {
  const { data = [], isLoading, isError } = useQuery({
    queryKey: [QUERY_KEYS.devices],
    queryFn: fetchDevices,
  });

  if (isLoading) {
    return <p className="text-muted">Loading devices…</p>;
  }

  if (isError) {
    return <p className="text-red-500">Unable to load devices right now. Please try again shortly.</p>;
  }

  return <DeviceTable devices={data} />;
}
