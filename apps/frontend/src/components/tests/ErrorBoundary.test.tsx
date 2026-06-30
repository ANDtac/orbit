import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { renderWithProviders } from "@/tests/renderWithProviders";

describe("ErrorBoundary", () => {
  it("shows the fallback UI and retries the subtree", async () => {
    let shouldThrow = true;
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    function FlakyComponent() {
      if (shouldThrow) {
        throw new Error("boom");
      }
      return <div>Recovered content</div>;
    }

    const user = userEvent.setup();
    renderWithProviders(
      <ErrorBoundary>
        <FlakyComponent />
      </ErrorBoundary>,
    );

    expect(await screen.findByText("This view hit a client-side error.")).toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Recovered content")).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
