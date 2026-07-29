import { useEffect } from "react";

import { applyBrandTheme, getSavedBrandTheme } from "@/lib/brand-colors";

const THEME_KEY = "alex-dash-theme";

/** Aplica tema escuro/claro como no painel PHP (data-bs-theme no html). */
export function AdminTheme() {
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    const theme = saved === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-bs-theme", theme);
    document.body.classList.add("dashboard-app", "dashboard-app--react");
    applyBrandTheme(getSavedBrandTheme());

    return () => {
      document.body.classList.remove("dashboard-app", "dashboard-app--react", "dashboard-has-visao-banner");
    };
  }, []);

  return null;
}

export function setAdminTheme(mode: "light" | "dark") {
  localStorage.setItem(THEME_KEY, mode);
  document.documentElement.setAttribute("data-bs-theme", mode);
}

export function getAdminTheme(): "light" | "dark" {
  return document.documentElement.getAttribute("data-bs-theme") === "light" ? "light" : "dark";
}
