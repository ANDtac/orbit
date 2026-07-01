import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fetchPlatforms } from "@/features/devices/api/platforms.api";
import {
  createOperationTemplate,
  fetchOperationTemplates,
} from "@/features/admin/api/operationTemplates.api";
import { OperationTemplatesPage } from "@/features/admin/pages/OperationTemplatesPage";
import { renderWithProviders } from "@/tests/renderWithProviders";

vi.mock("@/features/devices/api/platforms.api", () => ({
  fetchPlatforms: vi.fn(),
}));

vi.mock("@/features/admin/api/operationTemplates.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/admin/api/operationTemplates.api")>();
  return {
    ...actual,
    fetchOperationTemplates: vi.fn(),
    createOperationTemplate: vi.fn(),
    updateOperationTemplate: vi.fn(),
    deleteOperationTemplate: vi.fn(),
  };
});

describe("OperationTemplatesPage", () => {
  beforeEach(() => {
    vi.mocked(fetchPlatforms).mockResolvedValue([
      { id: 1, slug: "cisco_ios", display_name: "Cisco IOS" },
    ]);
    vi.mocked(fetchOperationTemplates).mockResolvedValue([
      {
        id: 11,
        platform_id: 1,
        name: "Backup Running Config",
        description: "Capture the current running config",
        op_type: "backup",
        template: "show running-config",
        variables: {},
        updated_at: "2026-03-31T12:00:00Z",
      },
    ]);
    vi.mocked(createOperationTemplate).mockResolvedValue({
      id: 12,
      platform_id: 1,
      name: "Show Version",
      description: "Collect show version output",
      op_type: "show_version",
      template: "show version",
      variables: {},
      updated_at: "2026-03-31T12:05:00Z",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("opens the form and creates a new template", async () => {
    const user = userEvent.setup();

    renderWithProviders(<OperationTemplatesPage />);

    expect(await screen.findByText("Backup Running Config")).toBeInTheDocument();
    // Column relabeled from the untruthful "Updated"/"Last used" to "Last modified".
    expect(screen.getByText("Last modified")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New template" }));
    await user.selectOptions(screen.getByLabelText(/Platform/i), "1");
    await user.type(screen.getByLabelText(/Template Name/i), "Show Version");
    await user.type(screen.getByLabelText(/Operation Type/i), "show_version");
    await user.type(screen.getByLabelText(/Description/i), "Collect show version output");
    await user.type(screen.getByLabelText(/Template Body/i), "show version");
    await user.click(screen.getByRole("button", { name: "Create template" }));

    await waitFor(() => {
      expect(createOperationTemplate).toHaveBeenCalled();
    });

    const call = vi.mocked(createOperationTemplate).mock.calls[0]?.[0];
    expect(call?.name).toBe("Show Version");
    expect(call?.op_type).toBe("show_version");
    expect(call?.platform_id).toBe(1);
    expect(call?.template).toBe("show version");
  });
});
