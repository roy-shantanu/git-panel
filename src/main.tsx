import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./refactor/styles/index.css";

console.log("Git Panel UI starting (diff-payload worker build)");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
