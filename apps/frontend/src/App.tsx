import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppProviders } from "./app/AppProviders";
import { AppRoutes } from "./app/routes";

function App(): JSX.Element {
  return (
    <AppProviders>
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
    </AppProviders>
  );
}

export default App;
