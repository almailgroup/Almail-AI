"use client";

import { useEffect } from "react";
import { useUiStore } from "@/store/ui-store";

/** Reflects the persisted theme onto <html> once the store has rehydrated. */
export function ThemeSync() {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  return null;
}
