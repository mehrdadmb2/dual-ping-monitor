window.DPM_CONFIG = {
  defaultLanguage: "en",
  defaultTheme: "midnight",
  refreshMs: 60000,
  historyDays: 90,
  chartPoints: 120,

  dataRoot: "./data",

  repoUrl: "https://github.com/mehrdadmb2/dual-ping-monitor",
  pagesUrl: "https://mehrdadmb2.github.io/dual-ping-monitor/",
  workerUrl: "https://dual-ping-worker.game-developer-mb.workers.dev",

  // Public endpoints used by the dashboard. No secret is stored here.
  workerHealthPath: "/health"
};
