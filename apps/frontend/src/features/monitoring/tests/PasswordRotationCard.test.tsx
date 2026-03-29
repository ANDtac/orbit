import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PasswordRotationCard } from "@/features/monitoring/components/PasswordRotationCard";
import { queuePasswordRotation } from "@/features/monitoring/api/monitoring.api";

vi.mock("@/features/monitoring/api/monitoring.api", () => ({
  queuePasswordRotation: vi.fn(),
}));

describe("PasswordRotationCard", () => {
  it("requires typed confirmation before queuing password rotation", async () => {
    const user = userEvent.setup();
    const mockedQueue = vi.mocked(queuePasswordRotation);
    mockedQueue.mockResolvedValue({
      enqueued: true,
      job: {
        id: 42,
        uuid: "abc",
        job_type: "password_change",
        status: "queued",
        tasks: [],
        events: [],
        timestamps: {},
      },
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <PasswordRotationCard />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Queue password rotation" }));

    const confirmButton = screen.getByRole("button", { name: "Confirm and queue" });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText("Type ROTATE to confirm"), "ROTATE");
    await user.click(confirmButton);

    await waitFor(() => {
      expect(mockedQueue).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("Password rotation job #42 queued successfully.")).toBeInTheDocument();
  });
});
