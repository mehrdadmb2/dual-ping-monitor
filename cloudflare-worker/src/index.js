const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Run-Key",
  "Cache-Control": "no-store"
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function json(data, init = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS,
      ...(init.headers || {})
    }
  });
}

function errorText(error) {
  if (!error) return "unknown error";
  if (error.name === "AbortError") return "timeout";
  return error.message || String(error);
}

function classify(status) {
  if (status >= 200 && status < 400) return "up";
  if (status >= 400 && status < 600) return "degraded";
  return "down";
}

async function requestWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

async function probeTarget(target, env, request) {
  const raw = String(target.url || "").trim();
  const urls = /^https?:\/\//i.test(raw)
    ? [raw]
    : [`https://${raw}`, `http://${raw}`];

  let lastError = null;

  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      try {
        const headers = {
          "User-Agent": "DualPingMonitor-Cloudflare/4.0",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        };

        let method = "HEAD";
        let response = await requestWithTimeout(url, {
          method: "HEAD",
          headers
        }, Number(env.REQUEST_TIMEOUT_MS || 8000));

        if (response.status === 405 || response.status === 501) {
          method = "GET";
          response = await requestWithTimeout(url, {
            method: "GET",
            headers: { ...headers, Range: "bytes=0-0" }
          }, Number(env.REQUEST_TIMEOUT_MS || 8000));
        }

        const latency = Date.now() - started;
        const finalUrl = response.url || url;
        try { await response.body?.cancel(); } catch {}

        return {
          id: target.id || target.name,
          name: target.name || target.id,
          target: raw,
          category: target.category || "Other",
          type: "site",
          status: classify(response.status),
          latency,
          packet_loss: null,
          jitter: null,
          http_status: response.status,
          response_status: response.statusText || "",
          protocol: new URL(finalUrl).protocol.replace(":", ""),
          resolved_url: finalUrl,
          method,
          attempt: attempt + 1,
          error: null,
          edge: request.cf?.colo || null,
          country: request.cf?.country || null,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        lastError = error;
        if (attempt === 0) await sleep(250);
      }
    }
  }

  return {
    id: target.id || target.name,
    name: target.name || target.id,
    target: raw,
    category: target.category || "Other",
    type: "site",
    status: "down",
    latency: null,
    packet_loss: 100,
    jitter: null,
    http_status: null,
    response_status: "",
    protocol: null,
    resolved_url: null,
    method: null,
    attempt: 2,
    error: errorText(lastError),
    edge: request.cf?.colo || null,
    country: request.cf?.country || null,
    timestamp: new Date().toISOString()
  };
}

async function loadTargets(env) {
  const url = env.TARGETS_URL ||
    `https://raw.githubusercontent.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/${env.GITHUB_BRANCH || "main"}/targets.json`;

  const response = await fetch(url, {
    headers: {
      "Cache-Control": "no-cache",
      "User-Agent": "DualPingMonitor-Cloudflare/4.0"
    }
  });

  if (!response.ok) {
    throw new Error(`targets.json returned HTTP ${response.status}`);
  }

  return response.json();
}

function summarize(results) {
  const values = results.map(x => x.latency).filter(Number.isFinite);
  return {
    total: results.length,
    up: results.filter(x => x.status === "up").length,
    degraded: results.filter(x => x.status === "degraded").length,
    down: results.filter(x => x.status === "down").length,
    unknown: results.filter(x => x.status === "unknown").length,
    measured: values.length,
    avg_latency: values.length ? Math.round(values.reduce((a,b)=>a+b,0) / values.length) : null,
    min_latency: values.length ? Math.min(...values) : null,
    max_latency: values.length ? Math.max(...values) : null
  };
}

async function probeAll(env, request) {
  const targets = (await loadTargets(env)).sites || [];
  const enabled = targets.filter(target => target.enabled !== false);
  const results = [];

  for (let i = 0; i < enabled.length; i += 8) {
    const chunk = enabled.slice(i, i + 8);
    results.push(...await Promise.all(chunk.map(target => probeTarget(target, env, request))));
  }

  return {
    schema_version: 4,
    timestamp: new Date().toISOString(),
    source: "cloudflare",
    edge: request.cf?.colo || null,
    country: request.cf?.country || null,
    ...summarize(results),
    results
  };
}

function encodeBase64Utf8(value) {
  return btoa(unescape(encodeURIComponent(value)));
}

function decodeBase64Utf8(value) {
  return decodeURIComponent(escape(atob(value.replace(/\n/g, ""))));
}

async function githubGet(env, repoPath) {
  const url =
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${repoPath}?ref=${encodeURIComponent(env.GITHUB_BRANCH || "main")}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "DualPingMonitor-Cloudflare"
    }
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub GET ${repoPath}: HTTP ${response.status}`);
  return response.json();
}

async function githubPut(env, repoPath, content, sha, message) {
  const url =
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${repoPath}`;

  const payload = {
    message,
    content: encodeBase64Utf8(content),
    branch: env.GITHUB_BRANCH || "main"
  };

  if (sha) payload.sha = sha;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "DualPingMonitor-Cloudflare"
    },
    body: JSON.stringify(payload)
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub PUT ${repoPath}: HTTP ${response.status} ${body.slice(0, 350)}`);
  }
  return JSON.parse(body);
}

async function publishRecord(env, record) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    throw new Error("Cloudflare Worker is missing GitHub publisher configuration");
  }

  const date = record.timestamp.slice(0, 10);
  const dayPath = `data/cloudflare/${date}.json`;

  let history = [];
  const current = await githubGet(env, dayPath);

  if (current?.content) {
    try {
      const decoded = decodeBase64Utf8(current.content);
      const parsed = JSON.parse(decoded);
      if (Array.isArray(parsed)) history = parsed;
    } catch {
      history = [];
    }
  }

  history.push(record);
  if (history.length > 500) history = history.slice(-500);

  // IMPORTANT:
  // This Worker is the only component allowed to create/update data/cloudflare/*.
  // GitHub Actions never stages these files and never needs a Cloudflare token.
  try {
    await githubPut(env, dayPath, JSON.stringify(history, null, 2), current?.sha || null,
      `chore(data): Cloudflare telemetry ${date}`);
  } catch {
    const fresh = await githubGet(env, dayPath);
    await githubPut(env, dayPath, JSON.stringify([...history.slice(0, -1), record], null, 2), fresh?.sha || null,
      `chore(data): Cloudflare telemetry ${date}`);
  }

  const latestPath = "data/cloudflare/latest.json";
  const latest = await githubGet(env, latestPath);
  await githubPut(env, latestPath, JSON.stringify(record, null, 2), latest?.sha || null,
    "chore(data): Cloudflare latest telemetry");

  return { dayPath, latestPath };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "dual-ping-worker",
        version: "4.0",
        mode: "cloudflare-edge-probe",
        publisherConfigured: Boolean(env.GITHUB_TOKEN),
        now: new Date().toISOString()
      });
    }

    if (url.pathname === "/" && request.method === "GET") {
      try {
        const record = await probeAll(env, request);
        return json({
          ok: true,
          service: "dual-ping-worker",
          mode: "preview",
          record,
          note: "Preview mode does not write to GitHub."
        });
      } catch (error) {
        return json({ ok: false, error: errorText(error) }, { status: 500 });
      }
    }

    if (url.pathname === "/run" && request.method === "POST") {
      if (!env.RUN_KEY) {
        return json({ ok: false, error: "RUN endpoint is disabled until RUN_KEY is configured." }, { status: 503 });
      }

      const supplied = request.headers.get("X-Run-Key");
      if (supplied !== env.RUN_KEY) {
        return json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }

      try {
        const record = await probeAll(env, request);
        const publication = await publishRecord(env, record);
        return json({ ok: true, record, publication });
      } catch (error) {
        return json({ ok: false, error: errorText(error) }, { status: 500 });
      }
    }

    return json({ ok: false, error: "Not Found", endpoints: ["/", "/health", "/run"] }, { status: 404 });
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      probeAll(env, new Request("https://worker.internal/", {
        headers: { "CF-Worker": "scheduled" }
      }))
      .then(record => publishRecord(env, record))
      .then(result => console.log(JSON.stringify({ ok: true, publication: result })))
      .catch(error => console.error("Scheduled Cloudflare monitor failed:", error))
    );
  }
};
