import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { Header } from "@/components/layout/Header";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: "dark",
  }),
}));

vi.mock("@/app/store", () => ({
  useAppStore: () => ({
    isSidebarOpen: false,
    toggleSidebar: vi.fn(),
  }),
}));

describe("Header monitoring navigation", () => {
  it("renders monitoring links alongside existing device workflow", () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Devices" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Monitoring" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jobs" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Policies" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Logs" })).toBeInTheDocument();
  });
});
