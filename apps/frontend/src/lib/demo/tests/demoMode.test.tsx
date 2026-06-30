import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { DemoProvider, isDemoActive, useDemo } from "@/contexts/DemoContext";
import { deleteCookie, setCookie } from "@/lib/cookies";
import { resetDemoData } from "@/lib/demo/generators";

vi.mock("@/lib/cookies", () => ({
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));

vi.mock("@/lib/demo/generators", () => ({
  resetDemoData: vi.fn(),
}));

function DemoHarness(): JSX.Element {
  const { isDemo, enterDemo, exitDemo } = useDemo();

  return (
    <div>
      <span>{isDemo ? "demo-on" : "demo-off"}</span>
      <button type="button" onClick={enterDemo}>
        Enter Demo
      </button>
      <button type="button" onClick={exitDemo}>
        Exit Demo
      </button>
    </div>
  );
}

describe("demo mode", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleErrorSpy: any;

  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation((message: unknown) => {
        if (typeof message === "string" && message.includes("Not implemented: navigation")) {
          return;
        }
      });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("detects persisted demo state on mount", () => {
    sessionStorage.setItem("orbit.demo_mode", "true");

    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <DemoProvider>
          <DemoHarness />
        </DemoProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("demo-on")).toBeInTheDocument();
    expect(isDemoActive()).toBe(true);
  });

  it("activates and clears demo mode state", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <DemoProvider>
          <DemoHarness />
        </DemoProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Enter Demo" }));
    expect(sessionStorage.getItem("orbit.demo_mode")).toBe("true");
    expect(setCookie).toHaveBeenCalledTimes(1);
    expect(isDemoActive()).toBe(true);

    await user.click(screen.getByRole("button", { name: "Exit Demo" }));
    expect(sessionStorage.getItem("orbit.demo_mode")).toBeNull();
    expect(deleteCookie).toHaveBeenCalledTimes(1);
    expect(resetDemoData).toHaveBeenCalledTimes(1);
    expect(isDemoActive()).toBe(false);
  });
});
