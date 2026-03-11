export function GET(request: Request) {
  const url = new URL(request.url);
  const seed = url.searchParams.get("seed");

  let script = `localStorage.removeItem("infinite-monitor-widgets");`;

  if (seed === "trading") {
    const widgets = [
      {
        id: "w-indices",
        title: "Market Indices",
        description: "",
        messages: [],
        files: null,
        
        
        layout: { i: "w-indices", x: 0, y: 0, w: 12, h: 2, minW: 2, minH: 2 },
      },
      {
        id: "w-stocks",
        title: "Stock Watchlist",
        description: "",
        messages: [],
        files: null,
        
        
        layout: { i: "w-stocks", x: 0, y: 2, w: 6, h: 5, minW: 2, minH: 2 },
      },
      {
        id: "w-news",
        title: "Market News",
        description: "",
        messages: [],
        files: null,
        
        
        layout: { i: "w-news", x: 6, y: 2, w: 6, h: 5, minW: 2, minH: 2 },
      },
      {
        id: "w-commodities",
        title: "Commodities",
        description: "",
        messages: [],
        files: null,
        
        
        layout: { i: "w-commodities", x: 0, y: 7, w: 4, h: 4, minW: 2, minH: 2 },
      },
      {
        id: "w-crypto",
        title: "Crypto Tracker",
        description: "",
        messages: [],
        files: null,
        
        
        layout: { i: "w-crypto", x: 4, y: 7, w: 4, h: 4, minW: 2, minH: 2 },
      },
      {
        id: "w-portfolio",
        title: "Portfolio P&L",
        description: "",
        messages: [],
        files: null,
        
        
        layout: { i: "w-portfolio", x: 8, y: 7, w: 4, h: 4, minW: 2, minH: 2 },
      },
    ];

    const state = {
      state: { widgets, activeWidgetId: "w-indices", streamingWidgetIds: [] },
      version: 0,
    };

    script = `localStorage.setItem("infinite-monitor-widgets", ${JSON.stringify(JSON.stringify(state))});`;
  }

  if (seed === "osint") {
    const widgets = [
      {
        id: "w-map",
        title: "World Event Map",
        description: "",
        messages: [],
        files: null,
        
        
        layout: { i: "w-map", x: 0, y: 0, w: 8, h: 6, minW: 3, minH: 4 },
      },
      {
        id: "w-social",
        title: "Social Monitor",
        description: "",
        messages: [],
        files: null,
        
        
        layout: { i: "w-social", x: 8, y: 0, w: 4, h: 6, minW: 2, minH: 3 },
      },
      {
        id: "w-feeds",
        title: "Intelligence Feeds",
        description: "",
        messages: [],
        files: null,
        
        
        layout: { i: "w-feeds", x: 0, y: 6, w: 6, h: 5, minW: 2, minH: 3 },
      },
      {
        id: "w-youtube",
        title: "Live Broadcasts",
        description: "",
        messages: [],
        files: null,
        
        
        layout: { i: "w-youtube", x: 6, y: 6, w: 6, h: 5, minW: 3, minH: 4 },
      },
      {
        id: "w-threat",
        title: "Threat Intelligence",
        description: "",
        messages: [],
        files: null,
        
        
        layout: { i: "w-threat", x: 0, y: 11, w: 4, h: 5, minW: 2, minH: 3 },
      },
      {
        id: "w-timeline",
        title: "Events Timeline",
        description: "",
        messages: [],
        files: null,
        
        
        layout: { i: "w-timeline", x: 4, y: 11, w: 8, h: 5, minW: 3, minH: 3 },
      },
    ];

    const state = {
      state: { widgets, activeWidgetId: "w-map", streamingWidgetIds: [] },
      version: 0,
    };

    script = `localStorage.setItem("infinite-monitor-widgets", ${JSON.stringify(JSON.stringify(state))});`;
  }

  const html = `<!DOCTYPE html>
<html><body><script>
${script}
window.location.href = "/";
</script></body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}
