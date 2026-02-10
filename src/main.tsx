import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./refactor/styles/index.css";

const bootstrap = async () => {
  if (import.meta.env.VITE_E2E === "1") {
    const { installE2ETauriMocks } = await import("./testing/installE2ETauriMocks");
    installE2ETauriMocks();
  }

  console.log("Git Panel UI starting (diff-payload worker build)");

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};

void bootstrap();
