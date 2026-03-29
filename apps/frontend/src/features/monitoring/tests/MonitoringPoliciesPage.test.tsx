import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MonitoringPoliciesPage } from "@/features/monitoring/pages/MonitoringPoliciesPage";
import { fetchPolicies } from "@/features/monitoring/api/monitoring.api";

vi.mock("@/features/monitoring/api/monitoring.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/monitoring/api/monitoring.api")>();

  return {
    ...actual,
    fetchPolicies: vi.fn(),
    createPolicy: vi.fn(),
    updatePolicy: vi.fn(),
    deletePolicy: vi.fn(),
  };
});

describe("MonitoringPoliciesPage", () => {
  it("renders policies table and opens create modal", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchPolicies).mockResolvedValue([
      {
        id: 7,
        name: "NTP compliance",
        description: "Ensure NTP peers are present",
        is_active: true,
      },
    ]);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MonitoringPoliciesPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("NTP compliance")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New policy" }));

    expect(screen.getByRole("heading", { name: "Create policy" })).toBeInTheDocument();
  });
});
