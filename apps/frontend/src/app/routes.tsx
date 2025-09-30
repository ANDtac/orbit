import { Routes, Route } from "react-router-dom";

import { Page } from "@/components/layout/Page";
import { Home } from "@/pages/Home";
import { DevicesListPage } from "@/features/devices/pages/DevicesListPage";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import { NotFound } from "@/pages/NotFound";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route element={<ProtectedRoute />}>
        <Route
          path="/"
          element={
            <Page
              title="Overview"
              description="Monitor the health of your network automation program at a glance."
            >
              <Home />
            </Page>
          }
        />
        <Route
          path="/devices"
          element={
            <Page
              title="Devices"
              description="Inventory of managed devices with real-time health indicators."
            >
              <DevicesListPage />
            </Page>
          }
        />
        <Route
          path="*"
          element={
            <Page title="Not found">
              <NotFound />
            </Page>
          }
        />
      </Route>
      <Route path="/login" element={<LoginPage />} />
    </Routes>
  );
}
