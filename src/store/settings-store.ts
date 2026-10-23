import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_MODEL } from "@/lib/model-registry";
import type { SearchProvider } from "@/lib/web-search";
import type { OrcaCredentialSource } from "@/lib/orcarouter/credentials";

export type McpTransportType = "command" | "sse" | "streamableHttp";

export interface McpServerConfig {
  id: string;
  name: string;
  type: McpTransportType;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  enabled: boolean;
}

export type CustomApiType = "anthropic" | "openai";

export interface CustomApiModel {
  id: string;
  name: string;
}

export interface CustomApiConfig {
  id: string;
  name: string;
  endpoint: string;
  type: CustomApiType;
  apiKey?: string;
  models: CustomApiModel[];
  enabled: boolean;
}

/**
 * OrcaRouter credential metadata. The key itself lives in the store's
 * existing `apiKeys` map (browser localStorage), exactly like every other
 * BYOK provider; this only records how it was obtained and its lifecycle.
 */
export interface OrcaRouterAuthState {
  source: OrcaCredentialSource | null;
  scope: string | null;
  userId: string | null;
  generation: number;
  needsReauth: boolean;
  updatedAt: number | null;
}

const INITIAL_ORCAROUTER_AUTH: OrcaRouterAuthState = {
  source: null,
  scope: null,
  userId: null,
  generation: 0,
  needsReauth: false,
  updatedAt: null,
};

interface SettingsStore {
  selectedModel: string;
  apiKeys: Record<string, string>;
  searchProvider: SearchProvider | null;
  mcpServers: McpServerConfig[];
  customApis: CustomApiConfig[];
  orcarouterAuth: OrcaRouterAuthState;
  setModel: (model: string) => void;
  setApiKey: (provider: string, key: string) => void;
  removeApiKey: (provider: string) => void;
  getApiKey: (provider: string) => string | undefined;
  setOrcaRouterCredential: (credential: {
    key: string;
    source: OrcaCredentialSource;
    scope?: string | null;
    userId?: string | null;
  }) => number;
  clearOrcaRouterCredential: () => void;
  markOrcaRouterNeedsReauth: (generation: number) => void;
  setSearchProvider: (provider: SearchProvider | null) => void;
  addMcpServer: (server: McpServerConfig) => void;
  updateMcpServer: (id: string, updates: Partial<Omit<McpServerConfig, "id">>) => void;
  removeMcpServer: (id: string) => void;
  toggleMcpServer: (id: string) => void;
  addCustomApi: (config: CustomApiConfig) => void;
  updateCustomApi: (id: string, updates: Partial<Omit<CustomApiConfig, "id">>) => void;
  removeCustomApi: (id: string) => void;
  toggleCustomApi: (id: string) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      selectedModel: DEFAULT_MODEL,
      apiKeys: {},
      searchProvider: null,
      mcpServers: [],
      customApis: [],
      orcarouterAuth: INITIAL_ORCAROUTER_AUTH,

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

      setOrcaRouterCredential: ({ key, source, scope, userId }) => {
        const generation = get().orcarouterAuth.generation + 1;
        set((state) => ({
          apiKeys: { ...state.apiKeys, orcarouter: key },
          orcarouterAuth: {
            source,
            scope: scope ?? null,
            userId: userId ?? null,
            generation,
            needsReauth: false,
            updatedAt: Date.now(),
          },
        }));
        return generation;
      },

      clearOrcaRouterCredential: () =>
        set((state) => {
          const nextKeys = { ...state.apiKeys };
          delete nextKeys.orcarouter;
          return {
            apiKeys: nextKeys,
            orcarouterAuth: {
              ...INITIAL_ORCAROUTER_AUTH,
              generation: state.orcarouterAuth.generation + 1,
            },
          };
        }),

      // Generation-safe: a late 401 from an old request must never mark a
      // freshly reauthorized credential as broken.
      markOrcaRouterNeedsReauth: (generation) =>
        set((state) =>
          state.orcarouterAuth.generation === generation
            ? { orcarouterAuth: { ...state.orcarouterAuth, needsReauth: true } }
            : {}
        ),

      setSearchProvider: (provider) => set({ searchProvider: provider }),

      addMcpServer: (server) =>
        set((state) => ({
          mcpServers: [...state.mcpServers, server],
        })),

      updateMcpServer: (id, updates) =>
        set((state) => ({
          mcpServers: state.mcpServers.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),

      removeMcpServer: (id) =>
        set((state) => ({
          mcpServers: state.mcpServers.filter((s) => s.id !== id),
        })),

      toggleMcpServer: (id) =>
        set((state) => ({
          mcpServers: state.mcpServers.map((s) =>
            s.id === id ? { ...s, enabled: !s.enabled } : s
          ),
        })),

      addCustomApi: (config) =>
        set((state) => ({
          customApis: [...state.customApis, config],
        })),

      updateCustomApi: (id, updates) =>
        set((state) => ({
          customApis: state.customApis.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      removeCustomApi: (id) =>
        set((state) => ({
          customApis: state.customApis.filter((c) => c.id !== id),
        })),

      toggleCustomApi: (id) =>
        set((state) => ({
          customApis: state.customApis.map((c) =>
            c.id === id ? { ...c, enabled: !c.enabled } : c
          ),
        })),
    }),
    {
      name: "infinite-monitor-settings",
    }
  )
);
