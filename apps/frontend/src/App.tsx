import { AppProviders } from "./app/AppProviders";
import { AppRoutes } from "./app/routes";

function App(): JSX.Element {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  );
}

export default App;
