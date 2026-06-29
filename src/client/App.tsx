import { DebugPage } from "./pages/DebugPage";
import { FormalGameApp } from "./pages/HomePage";

export function App() {
  return window.location.pathname === "/debug"
    ? <DebugPage />
    : <FormalGameApp />;
}
