// theme.ts - light / dark switch. With no saved choice the app follows the device setting;
// clicking the toggle saves an explicit choice in this browser.
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "hf-theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function saved(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function current(): Theme {
  return saved() ?? (media().matches ? "dark" : "light");
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(current);

  // Follow the device while no explicit choice is saved.
  useEffect(() => {
    const m = media();
    const onChange = () => { if (!saved()) setTheme(m.matches ? "dark" : "light"); };
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* storage blocked: still switches for this visit */ }
    setTheme(next);
  };

  return [theme, toggle];
}

export function ThemeToggle({ floating = false }: { floating?: boolean }) {
  const [theme, toggle] = useTheme();
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button type="button" className={floating ? "theme-toggle floating" : "theme-toggle"} onClick={toggle} aria-label={label} title={label}>
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
