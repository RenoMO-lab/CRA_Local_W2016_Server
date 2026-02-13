import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from "next-themes";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider
    attribute="class"
    defaultTheme="dark"
    enableSystem
    storageKey="cra-theme"
    disableTransitionOnChange
  >
    <App />
  </ThemeProvider>,
);

const splash = document.getElementById("app-splash");
if (splash) {
  requestAnimationFrame(() => splash.remove());
}
