"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "./theme-script";

export type ThemeChoice = "light" | "dark" | "system";

const listeners = new Set<() => void>();
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && media().matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as ThemeChoice);
  const resolved = useSyncExternalStore(
    subscribe,
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "light" as const,
  );

  // Segue il tema di sistema quando la scelta è "system".
  useEffect(() => {
    const mq = media();
    const onChange = () => {
      if (read() === "system") {
        apply("system");
        listeners.forEach((l) => l());
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((choice: ThemeChoice) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, choice);
    } catch {
      // Archiviazione non disponibile: il tema vale solo per questa pagina.
    }
    apply(choice);
    listeners.forEach((l) => l());
  }, []);

  return { theme, resolvedTheme: resolved, setTheme };
}
