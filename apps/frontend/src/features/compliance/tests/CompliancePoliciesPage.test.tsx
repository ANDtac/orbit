import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  createPolicy,
  evaluateCompliance,
  fetchPolicies,
  fetchRules,
} from "@/features/compliance/api/compliance.api";
import { CompliancePoliciesPage } from "@/features/compliance/pages/CompliancePoliciesPage";
import { renderWithProviders } from "@/tests/renderWithProviders";

vi.mock("@/features/compliance/api/compliance.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/compliance/api/compliance.api")>();
  return {
    ...actual,
    fetchPolicies: vi.fn(),
    fetchRules: vi.fn(),
    createPolicy: vi.fn(),
    updatePolicy: vi.fn(),
    deletePolicy: vi.fn(),
    createRule: vi.fn(),
    updateRule: vi.fn(),
    deleteRule: vi.fn(),
    evaluateCompliance: vi.fn(),
  };
});

describe("CompliancePoliciesPage", () => {
  beforeEach(() => {
    vi.mocked(fetchPolicies).mockResolvedValue([
      {
        id: 1,
        name: "NTP Baseline",
        description: "Ensure NTP is configured",
        is_active: true,
      },
    ]);
    vi.mocked(fetchRules).mockResolvedValue([
      {
        id: 11,
        policy_id: 1,
        name: "ntp server present",
        severity: "high",
        rule_type: "regex",
        expression: "^ntp server",
      },
    ]);
    vi.mocked(createPolicy).mockResolvedValue({
      id: 2,
      name: "SSH Baseline",
      description: "Ensure SSHv2 only",
      is_active: true,
    });
    vi.mocked(evaluateCompliance).mockResolvedValue({
      status: "queued",
      enqueued_at: "2026-03-31T12:00:00Z",
      job: {
        id: 33,
        uuid: "demo-job",
        job_type: "compliance.evaluate",
        status: "queued",
        timestamps: {},
        tasks: [],
        events: [],
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders rules for the selected policy and queues evaluation", async () => {
    const user = userEvent.setup();

    renderWithProviders(<CompliancePoliciesPage />);

    expect(await screen.findByText("NTP Baseline")).toBeInTheDocument();
    expect(await screen.findByText("ntp server present")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Evaluate" }));

    await waitFor(() => {
      expect(vi.mocked(evaluateCompliance).mock.calls[0]?.[0]).toEqual({ policy_ids: [1], async: true });
    });

    expect(await screen.findByText(/Compliance evaluation started for 1 policy/i)).toBeInTheDocument();
  });

  it("creates a new policy from the modal", async () => {
    const user = userEvent.setup();

    renderWithProviders(<CompliancePoliciesPage />);

    expect(await screen.findByText("NTP Baseline")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New policy" }));
    await user.type(screen.getByLabelText("Policy Name"), "SSH Baseline");
    await user.type(screen.getByLabelText("Description"), "Ensure SSHv2 only");
    await user.click(screen.getByRole("button", { name: "Create policy" }));

    await waitFor(() => {
      expect(vi.mocked(createPolicy)).toHaveBeenCalled();
    });

    const call = vi.mocked(createPolicy).mock.calls[0]?.[0];
    expect(call?.name).toBe("SSH Baseline");
    expect(call?.description).toBe("Ensure SSHv2 only");
  });
});
