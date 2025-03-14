import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { RouterProvider } from "react-router-dom";
import { ThemeProvider } from "./lib/theme-provider";
import { BillStatsProvider } from "./lib/contexts/BillStatsContext";
import { router } from "./routes";
import { initCacheSystem } from "./lib/api";

import { TempoDevtools } from "tempo-devtools";
TempoDevtools.init();

// Initialize the caching system as early as possible
// This ensures we check for server-side caching availability immediately
initCacheSystem().catch(err => {
  console.warn('Failed to initialize cache system:', err);
  // Continue with app startup even if cache init fails
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark">
      <BillStatsProvider>
        <RouterProvider router={router} />
      </BillStatsProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
