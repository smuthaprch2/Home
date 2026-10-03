const http = require("http");

const PORT = Number(process.env.PORT || 10000);
const ROUTER_TOKEN = process.env.ROUTER_TOKEN || "";

const ROUTES = {
  system: "DISCORD_SYSTEM_TEST_WEBHOOK",
  family: "DISCORD_FAMILY_ALERTS_WEBHOOK",
  task: "DISCORD_TASK_ALERTS_WEBHOOK",
  command: "DISCORD_COMMAND_BRIEFS_WEBHOOK",
  trading: "DISCORD_TRADING_ALERTS_WEBHOOK",
  rosetta: "DISCORD_ROSETTA_BACKUP_WEBHOOK"
};

const SEVERITY_COLORS = {
  info: 5793266,
  notice: 3447003,
  warning: 16776960,
  critical: 15158332,
  success: 3066993
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 100000) {
        reject(new Error("payload_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function authorize(req) {
  if (!ROUTER_TOKEN) return false;
  const auth = req.headers.authorization || "";
  return auth === `Bearer ${ROUTER_TOKEN}`;
}

async function postDiscord(webhookUrl, payload) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`discord_${response.status}:${text.slice(0, 300)}`);
  }
}

function buildDiscordPayload(body) {
  const severity = String(body.severity || "info").toLowerCase();
  const title = String(body.title || "Alert").slice(0, 256);
  const message = String(body.message || "").slice(0, 4000);
  const source = String(body.source || "Command System").slice(0, 256);
  const timestamp = new Date().toISOString();

  const fields = [];
  if (body.eventTime) {
    fields.push({
      name: "Event time",
      value: String(body.eventTime).slice(0, 1024),
      inline: true
    });
  }
  if (body.action) {
    fields.push({
      name: "Action",
      value: String(body.action).slice(0, 1024),
      inline: false
    });
  }

  if (body.metadata && typeof body.metadata === "object") {
    for (const [key, value] of Object.entries(body.metadata).slice(0, 8)) {
      fields.push({
        name: String(key).slice(0, 256),
        value: String(value).slice(0, 1024),
        inline: true
      });
    }
  }

  return {
    username: "Huggins Command",
    allowed_mentions: { parse: [] },
    embeds: [{
      title,
      description: message || undefined,
      color: SEVERITY_COLORS[severity] || SEVERITY_COLORS.info,
      fields,
      footer: { text: source },
      timestamp
    }]
  };
}

async function runStartupSystemTest() {
  if (process.env.SEND_STARTUP_TEST !== "1") return;
  const webhookUrl = process.env.DISCORD_SYSTEM_TEST_WEBHOOK;
  if (!webhookUrl) {
    console.log("startup test skipped: system webhook not configured");
    return;
  }

  try {
    await postDiscord(webhookUrl, buildDiscordPayload({
      title: "SYSTEM TEST — Stage 1",
      message: "Discord delivery from the Huggins Command alert router is operational.",
      severity: "success",
      source: "Family Command / Render",
      action: "Confirm this alert was visible and audible on the intended devices."
    }));
    console.log("startup system test delivered");
  } catch (error) {
    console.error("startup system test failed:", error.message);
  }
}

async function runProductionRouteTests() {
  if (process.env.SEND_PRODUCTION_TEST !== "1") return;

  const tests = [
    {
      route: "family",
      title: "FAMILY ALERTS — Production Test",
      message: "Family alert delivery is operational.",
      source: "Family Command / Render",
      action: "Confirm this arrived in #family-alerts."
    },
    {
      route: "task",
      title: "TASK ALERTS — Production Test",
      message: "Task escalation delivery is operational.",
      source: "Family Command / Render",
      action: "Confirm this arrived in #task-alerts."
    },
    {
      route: "command",
      title: "COMMAND BRIEFS — Production Test",
      message: "Command brief delivery is operational.",
      source: "Family Command / Render",
      action: "Confirm this arrived in #command-briefs."
    }
  ];

  for (const test of tests) {
    const envName = ROUTES[test.route];
    const webhookUrl = process.env[envName];

    if (!webhookUrl) {
      console.log(`production test skipped: ${test.route} webhook not configured`);
      continue;
    }

    try {
      await postDiscord(webhookUrl, buildDiscordPayload({
        title: test.title,
        message: test.message,
        severity: "success",
        source: test.source,
        action: test.action
      }));
      console.log(`production test delivered: ${test.route}`);
    } catch (error) {
      console.error(`production test failed: ${test.route}:`, error.message);
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, {
      ok: true,
      service: "discord-alert-router",
      configuredRoutes: Object.fromEntries(
        Object.entries(ROUTES).map(([route, env]) => [route, Boolean(process.env[env])])
      )
    });
  }

  if (req.method === "POST" && url.pathname === "/alert") {
    if (!authorize(req)) {
      return json(res, 401, { ok: false, error: "unauthorized" });
    }

    try {
      const body = await readBody(req);
      const route = String(body.route || "").toLowerCase();
      const envName = ROUTES[route];

      if (!envName) {
        return json(res, 400, {
          ok: false,
          error: "unknown_route",
          allowedRoutes: Object.keys(ROUTES)
        });
      }

      const webhookUrl = process.env[envName];
      if (!webhookUrl) {
        return json(res, 503, {
          ok: false,
          error: "route_not_configured",
          route
        });
      }

      await postDiscord(webhookUrl, buildDiscordPayload(body));
      return json(res, 200, { ok: true, route });
    } catch (error) {
      const message = error && error.message ? error.message : "unknown_error";
      const status = message === "invalid_json" ? 400 : message === "payload_too_large" ? 413 : 502;
      return json(res, status, { ok: false, error: message });
    }
  }

  return json(res, 404, { ok: false, error: "not_found" });
});

server.listen(PORT, () => {
  console.log(`discord-alert-router listening on ${PORT}`);
  runStartupSystemTest();
  runProductionRouteTests();
});
