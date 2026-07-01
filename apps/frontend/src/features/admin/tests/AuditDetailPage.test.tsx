import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuditDetailPage } from "@/features/admin/pages/AuditDetailPage";
import type { AuditLogEntry } from "@/lib/types";
import { createTestQueryClient } from "@/tests/renderWithProviders";

const ENTRY: AuditLogEntry = {
  id: 42,
  uuid: "uuid-42",
  occurred_at: "2026-03-31T12:00:00Z",
  actor_display_name: "owner",
  action: "platform.update",
  target_type: "platform",
  target_repr: "cisco_nxos",
  ip_address: "10.0.0.10",
  payload: { before: { is_active: true }, after: { is_active: false } },
};

function renderDetail() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter
        initialEntries={[{ pathname: "/admin/audit/42", state: { entry: ENTRY } }]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <Routes>
          <Route path="/admin/audit/:id" element={<AuditDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AuditDetailPage", () => {
  it("renders a humanized before/after change table instead of raw JSON", () => {
    renderDetail();

    // Summary fields
    expect(screen.getByText("platform.update")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();

    // Change table with before/after columns and humanized field label
    expect(screen.getByText("Before")).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();
    expect(screen.getByText("Is Active")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();

    // Raw JSON blob should not be present
    expect(screen.queryByText(/"is_active"/)).not.toBeInTheDocument();
  });
});
