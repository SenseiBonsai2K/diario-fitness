import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./index.css";
import "./themes.css";
import "./i18n.js";
import App from "./App.jsx";
import { StoreProvider } from "./lib/store.jsx";
import { TimerProvider } from "./components/RestTimer.jsx";
import { requestPersistence } from "./lib/storage.js";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <StoreProvider>
      <TimerProvider>
        <App />
      </TimerProvider>
    </StoreProvider>
  </React.StrictMode>
);

requestPersistence();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
