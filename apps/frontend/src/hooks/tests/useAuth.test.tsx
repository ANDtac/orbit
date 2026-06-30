import { act, renderHook } from "@testing-library/react";

import { useAuth } from "@/hooks/useAuth";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/constants";
import { deleteCookie, getCookie } from "@/lib/cookies";
import { jwtDecode } from "jwt-decode";

vi.mock("jwt-decode", () => ({
  jwtDecode: vi.fn(),
}));

vi.mock("@/lib/cookies", () => ({
  getCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));

describe("useAuth", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleErrorSpy: any;

  beforeEach(() => {
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

  it("returns authenticated state and session-password presence for valid tokens", () => {
    vi.mocked(getCookie).mockImplementation((name) =>
      name === ACCESS_TOKEN_COOKIE ? "access-token" : null,
    );
    vi.mocked(jwtDecode).mockReturnValue({
      sub: "1",
      username: "owner",
      roles: ["owner"],
      exp: Math.floor(Date.now() / 1000) + 3600,
      ep: "encrypted-password",
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.hasSessionPassword).toBe(true);
    expect(result.current.payload?.username).toBe("owner");
  });

  it("returns unauthenticated for expired tokens", () => {
    vi.mocked(getCookie).mockImplementation((name) =>
      name === ACCESS_TOKEN_COOKIE ? "expired-token" : null,
    );
    vi.mocked(jwtDecode).mockReturnValue({
      exp: Math.floor(Date.now() / 1000) - 10,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.hasSessionPassword).toBe(false);
  });

  it("clears both auth cookies on logout", () => {
    vi.mocked(getCookie).mockImplementation((name) =>
      name === ACCESS_TOKEN_COOKIE ? "access-token" : null,
    );
    vi.mocked(jwtDecode).mockReturnValue({
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.logout();
    });

    expect(deleteCookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE);
    expect(deleteCookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE);
  });
});
