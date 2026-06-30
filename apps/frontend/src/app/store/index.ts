import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";

export interface AppPreferences {
  savedUsername: string | null;
  setSavedUsername: (username: string | null) => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  isSidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
}

const fallbackStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export const useAppStore = create<AppPreferences>()(
  persist(
    (set) => ({
      savedUsername: null,
      setSavedUsername: (username) => set({ savedUsername: username }),
      isSidebarOpen: false,
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      isSidebarCollapsed: false,
      toggleSidebarCollapsed: () =>
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
    }),
    {
      name: "orbit-app-store",
      storage: createJSONStorage(() => (typeof window === "undefined" ? fallbackStorage : window.localStorage)),
      partialize: (state) => ({
        savedUsername: state.savedUsername,
        isSidebarCollapsed: state.isSidebarCollapsed,
      }),
    },
  ),
);
