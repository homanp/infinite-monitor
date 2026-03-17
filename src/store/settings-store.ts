import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_MODEL } from "@/lib/model-registry";
import type { SearchProvider } from "@/lib/web-search";

interface SettingsStore {
  selectedModel: string;
  apiKeys: Record<string, string>;
  planEndpoints: Record<string, string>;
  searchProvider: SearchProvider | null;
  setModel: (model: string) => void;
  setApiKey: (provider: string, key: string) => void;
  removeApiKey: (provider: string) => void;
  getApiKey: (provider: string) => string | undefined;
  setPlanEndpoint: (provider: string, endpoint: string) => void;
  removePlanEndpoint: (provider: string) => void;
  getPlanEndpoint: (provider: string) => string | undefined;
  setSearchProvider: (provider: SearchProvider | null) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      selectedModel: DEFAULT_MODEL,
      apiKeys: {},
      planEndpoints: {},
      searchProvider: null,

      setModel: (model) => set({ selectedModel: model }),

      setApiKey: (provider, key) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        })),

      removeApiKey: (provider) =>
        set((state) => {
          const next = { ...state.apiKeys };
          delete next[provider];
          return { apiKeys: next };
        }),

      getApiKey: (provider) => get().apiKeys[provider],

      setPlanEndpoint: (provider, endpoint) =>
        set((state) => ({
          planEndpoints: { ...state.planEndpoints, [provider]: endpoint },
        })),

      removePlanEndpoint: (provider) =>
        set((state) => {
          const next = { ...state.planEndpoints };
          delete next[provider];
          return { planEndpoints: next };
        }),

      getPlanEndpoint: (provider) => get().planEndpoints[provider],

      setSearchProvider: (provider) => set({ searchProvider: provider }),
    }),
    {
      name: "infinite-monitor-settings",
    }
  )
);
