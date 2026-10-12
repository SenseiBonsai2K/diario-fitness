// Entry for compositore.html: the plan editor. It lives in the same app (same
// origin and scope), so it reads and updates the diary's data directly; opened
// from the installed app on iPhone it shares the app's storage.
import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "../index.css";
import "../themes.css";
import "../i18n.js";
import { StoreProvider } from "../lib/store.jsx";
import Composer from "./Composer.jsx";

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    const it = (document.documentElement.lang || "it").startsWith("it");
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "40px auto" }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>{it ? "Qualcosa non ha funzionato" : "Something went wrong"}</h1>
        <p style={{ marginBottom: 16 }}>{it ? "I dati del diario non sono stati toccati." : "The diary's data was not touched."}</p>
        <a href="./" style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #888", display: "inline-block" }}>{it ? "Torna al diario" : "Back to the diary"}</a>
        <pre style={{ marginTop: 16, fontSize: 11, whiteSpace: "pre-wrap", opacity: 0.7 }}>{String(this.state.error?.message || this.state.error)}</pre>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Boundary>
      <StoreProvider>
        <Composer />
      </StoreProvider>
    </Boundary>
  </React.StrictMode>
);
