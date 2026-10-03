"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_MODEL_ID, DEFAULT_SYSTEM_PROMPT } from "@/lib/models";

export type Theme = "light" | "dark";

interface UiState {
  // Persisted preferences
  theme: Theme;
  modelId: string;
  systemPrompt: string;
  temperature: number;
  sidebarOpen: boolean;

  // Session-only
  activeThreadId: string | null;
  commandOpen: boolean;
  artifactOpen: boolean;
  search: string;

  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setModelId: (id: string) => void;
  setSystemPrompt: (s: string) => void;
  setTemperature: (n: number) => void;
  setSidebarOpen: (b: boolean) => void;
  toggleSidebar: () => void;
  setActiveThreadId: (id: string | null) => void;
  setCommandOpen: (b: boolean) => void;
  setArtifactOpen: (b: boolean) => void;
  setSearch: (s: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: "light",
      modelId: DEFAULT_MODEL_ID,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      temperature: 0.7,
      sidebarOpen: true,

      activeThreadId: null,
      commandOpen: false,
      artifactOpen: false,
      search: "",

      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setModelId: (modelId) => set({ modelId }),
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
      setTemperature: (temperature) => set({ temperature }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setActiveThreadId: (activeThreadId) => set({ activeThreadId }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setArtifactOpen: (artifactOpen) => set({ artifactOpen }),
      setSearch: (search) => set({ search }),
    }),
    {
      name: "almail-ui",
      storage: createJSONStorage(() => localStorage),
      // The open thread and transient panels belong to the tab, not the user.
      partialize: (s) => ({
        theme: s.theme,
        modelId: s.modelId,
        systemPrompt: s.systemPrompt,
        temperature: s.temperature,
        sidebarOpen: s.sidebarOpen,
      }),
    },
  ),
);
