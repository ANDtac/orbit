import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchJobs, queueProbe } from "@/features/monitoring/api/monitoring.api";
import { MonitoringProbesPage } from "@/features/monitoring/pages/MonitoringProbesPage";
import { mockDevice, mockJob } from "@/tests/factories";
import { renderWithProviders } from "@/tests/renderWithProviders";

vi.mock("@/features/devices/api/devices.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/devices/api/devices.api")>();
  return {
    ...actual,
    fetchDevices: vi.fn(),
  };
});

vi.mock("@/features/monitoring/api/monitoring.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/monitoring/api/monitoring.api")>();
  return {
    ...actual,
    fetchJobs: vi.fn(),
    queueProbe: vi.fn(),
  };
});

describe("MonitoringProbesPage", () => {
  it("queues a probe job for selected devices", async () => {
    vi.mocked(fetchDevices).mockResolvedValue({
      data: [mockDevice({ id: 7, name: "core-rtr-01" })],
      page: { cursor: "0", size: 100, total: 1, next: null, prev: null },
    });
    vi.mocked(fetchJobs).mockResolvedValue({
      data: [mockJob({ id: 99, job_type: "device.probe", status: "queued", parameters: { probe_type: "icmp" } })],
      page: { cursor: "0", size: 10, total: 1, next: null, prev: null },
    });
    vi.mocked(queueProbe).mockResolvedValue({
      job: mockJob({ id: 123, job_type: "device.probe", status: "queued", parameters: { probe_type: "icmp" } }),
      enqueued: true,
    });

    const user = userEvent.setup();
    renderWithProviders(<MonitoringProbesPage />);

    expect(await screen.findByText("core-rtr-01")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Select row 7"));
    await user.click(screen.getByRole("button", { name: "Queue Probe Batch" }));

    expect(vi.mocked(queueProbe).mock.calls[0]?.[0]).toEqual({
      device_ids: [7],
      probe_type: "icmp",
      variables: undefined,
    });
    expect(await screen.findByText(/Probe batch queued as/i)).toBeInTheDocument();
  });
});
