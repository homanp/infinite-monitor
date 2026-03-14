export interface TemplateConfig {
  dashboardId: string;
  name: string;
  description: string;
  icon: "trending" | "globe" | "shield";
  screenshot: string;
}

export const TEMPLATES: TemplateConfig[] = [
  {
    dashboardId: "dash-1773346397131-0",
    name: "Crypto Trader",
    description: "Real-time crypto prices, charts, fear & greed index, top movers, and gas tracker.",
    icon: "trending",
    screenshot: "/templates/crypto-trader.jpg",
  },
  {
    dashboardId: "dash-1773350624090-0",
    name: "World Conflicts OSINT",
    description: "Conflict map, military news, YouTube OSINT feeds, displacement data, and airspace monitoring.",
    icon: "globe",
    screenshot: "/templates/world-conflicts.jpg",
  },
  {
    dashboardId: "dash-predictions",
    name: "Prediction Markets",
    description: "Live Polymarket and Kalshi markets, top traders, arbitrage scanner, and news feed.",
    icon: "shield",
    screenshot: "/templates/prediction-markets.jpg",
  },
];
