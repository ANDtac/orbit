import { AxiosError } from "axios";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { Route, Routes } from "react-router-dom";

import { login } from "@/features/auth/api/auth.api";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/constants";
import { renderWithProviders } from "@/tests/renderWithProviders";

const enterDemo = vi.fn();

vi.mock("@/features/auth/api/auth.api", () => ({
  login: vi.fn(),
}));

vi.mock("@/contexts/DemoContext", () => ({
  DemoProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useDemo: () => ({
    isDemo: false,
    enterDemo,
    exitDemo: vi.fn(),
  }),
  isDemoActive: () => false,
}));

function createToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

function renderLoginRoute(route = "/login") {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<div>Overview Home</div>} />
    </Routes>,
    { route },
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    document.cookie = `${ACCESS_TOKEN_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    document.cookie = `${REFRESH_TOKEN_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    sessionStorage.clear();
    localStorage.clear();
    enterDemo.mockReset();
    vi.clearAllMocks();
  });

  it("renders the cleaned login experience and supports demo mode", async () => {
    const user = userEvent.setup();
    renderLoginRoute();

    expect(screen.getByRole("heading", { name: "Secure access" })).toBeInTheDocument();
    expect(screen.getByText("Sign in with your network credentials.")).toBeInTheDocument();
    expect(screen.queryByText(/remember password/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/storing passwords/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try Demo Mode" }));
    expect(enterDemo).toHaveBeenCalledTimes(1);
  });

  it("submits valid credentials and redirects to the app", async () => {
    const user = userEvent.setup();
    vi.mocked(login).mockResolvedValue({
      access_token: createToken({
        sub: "1",
        username: "alice",
        roles: ["owner"],
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
      refresh_token: "refresh-token",
      expires_in: 3600,
      refresh_expires_in: 7200,
      user: {
        id: "1",
        username: "alice",
        displayName: "Alice",
        roles: ["owner"],
      },
    });

    renderLoginRoute();

    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "p@ssword");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByText("Overview Home");
    expect(login).toHaveBeenCalledWith({ username: "alice", password: "p@ssword" });
  });

  it("shows API failures inline", async () => {
    const user = userEvent.setup();
    vi.mocked(login).mockRejectedValue(
      new AxiosError(
        "Unauthorized",
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        {
          status: 401,
          statusText: "Unauthorized",
          headers: {},
          config: { headers: {} } as never,
          data: { message: "Invalid credentials" },
        },
      ),
    );

    renderLoginRoute();

    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid credentials");
  });

  it("redirects authenticated users away from login", async () => {
    document.cookie = `${ACCESS_TOKEN_COOKIE}=${createToken({
      sub: "1",
      username: "owner",
      roles: ["owner"],
      exp: Math.floor(Date.now() / 1000) + 3600,
    })}; path=/`;

    renderLoginRoute();

    await waitFor(() => {
      expect(screen.getByText("Overview Home")).toBeInTheDocument();
    });
  });
});
