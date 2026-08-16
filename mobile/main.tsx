import React from "react";
import { createRoot } from "react-dom/client";
import PocketDashboard from "../app/PocketDashboard";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Pocket Expense could not start.");
}

createRoot(root).render(
  <React.StrictMode>
    <PocketDashboard />
  </React.StrictMode>,
);
