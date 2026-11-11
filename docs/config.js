(() => {
  'use strict';
  window.DPM_CONFIG = Object.freeze({
    version: '4.0.1',
    schemaVersion: '4.0',
    dataBase: 'data/',
    targetCatalog: 'targets.json',
    workerUrl: 'https://dual-ping-worker.game-developer-mb.workers.dev',
    autoRefreshMs: 60000,
    staleAfterMs: 25 * 60 * 1000,
    defaultTheme: 'aurora',
    maxHistoryDays: 7,
    maxSnapshotsPerSource: 480
  });
})();
