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

/** If something crashes, show a way out instead of an empty screen. Data on the phone is untouched. */
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    const it = (document.documentElement.lang || "it").startsWith("it");
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "40px auto" }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>{it ? "Qualcosa non ha funzionato" : "Something went wrong"}</h1>
        <p style={{ marginBottom: 16 }}>{it ? "I tuoi dati sono al sicuro sul telefono. Ricarica l'app." : "Your data is safe on the phone. Reload the app."}</p>
        <button type="button" onClick={() => location.reload()} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #888" }}>{it ? "Ricarica" : "Reload"}</button>
        <pre style={{ marginTop: 16, fontSize: 11, whiteSpace: "pre-wrap", opacity: 0.7 }}>{String(this.state.error?.message || this.state.error)}</pre>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Boundary>
    <StoreProvider>
      <TimerProvider>
        <App />
      </TimerProvider>
    </StoreProvider>
    </Boundary>
  </React.StrictMode>
);

requestPersistence();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
