const { WebSocket } = require("ws");
const crypto = require("node:crypto");

const safeJsonParse = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const resolveOriginForUpstream = (upstreamUrl) => {
  const url = new URL(upstreamUrl);
  const proto = url.protocol === "wss:" ? "https:" : "http:";
  const hostname =
    url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "0.0.0.0"
      ? "localhost"
      : url.hostname;
  const host = url.port ? `${hostname}:${url.port}` : hostname;
  return `${proto}//${host}`;
};

function createGatewayListener(options) {
  const {
    loadUpstreamSettings,
    onEvent,
    onStatus,
    log = () => {},
    logError = (msg, err) => console.error(msg, err),
  } = options || {};

  if (typeof loadUpstreamSettings !== "function") {
    throw new Error("createGatewayListener requires loadUpstreamSettings().");
  }

  let ws = null;
  let closed = false;
  let status = "disconnected";
  let reconnectTimer = null;
  let backoffMs = 2000;

  const MAX_BACKOFF_MS = 30000;
  const CONNECT_TIMEOUT_MS = 15000;

  const setStatus = (next) => {
    if (status === next) return;
    status = next;
    try {
      onStatus?.(next);
    } catch {}
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, backoffMs);
    backoffMs = Math.min(backoffMs * 1.5, MAX_BACKOFF_MS);
  };

  const connect = async () => {
    if (closed) return;
    setStatus("connecting");

    let upstreamUrl = "";
    let upstreamToken = "";
    try {
      const settings = await loadUpstreamSettings();
      upstreamUrl = typeof settings?.url === "string" ? settings.url.trim() : "";
      upstreamToken = typeof settings?.token === "string" ? settings.token.trim() : "";
    } catch (err) {
      logError("Failed to load gateway settings for listener.", err);
      setStatus("disconnected");
      scheduleReconnect();
      return;
    }

    if (!upstreamUrl) {
      log("No gateway URL configured, retrying...");
      setStatus("disconnected");
      scheduleReconnect();
      return;
    }

    let origin;
    try {
      origin = resolveOriginForUpstream(upstreamUrl);
    } catch {
      logError("Invalid gateway URL for listener.", upstreamUrl);
      setStatus("disconnected");
      scheduleReconnect();
      return;
    }

    try {
      ws = new WebSocket(upstreamUrl, { origin });
    } catch (err) {
      logError("Failed to create WebSocket for listener.", err);
      setStatus("disconnected");
      scheduleReconnect();
      return;
    }

    const connectId = crypto.randomUUID();
    let connectAcked = false;

    const connectTimeoutHandle = setTimeout(() => {
      if (!connectAcked && ws) {
        log("Connect timeout, closing.");
        try {
          ws.close(1000, "connect timeout");
        } catch {}
      }
    }, CONNECT_TIMEOUT_MS);

    ws.on("open", () => {
      const frame = {
        type: "req",
        id: connectId,
        method: "connect",
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: "mission-control-listener",
            version: "1.0",
            platform: "node",
            mode: "observer",
          },
          role: "operator",
          scopes: ["operator.admin"],
          caps: [],
          ...(upstreamToken ? { auth: { token: upstreamToken } } : {}),
        },
      };
      ws.send(JSON.stringify(frame));
    });

    ws.on("message", (raw) => {
      const parsed = safeJsonParse(String(raw));
      if (!parsed) return;

      // Handle connect response
      if (parsed.type === "res" && parsed.id === connectId) {
        clearTimeout(connectTimeoutHandle);
        connectAcked = true;
        if (parsed.ok !== false) {
          backoffMs = 2000;
          setStatus("connected");
          log("Connected to gateway.");
        } else {
          logError("Connect rejected.", parsed.error);
          try {
            ws.close(1000, "connect rejected");
          } catch {}
        }
        return;
      }

      // Forward event frames
      if (parsed.type === "event") {
        try {
          onEvent?.(parsed);
        } catch (err) {
          logError("Event handler error.", err);
        }
        return;
      }
    });

    ws.on("close", () => {
      clearTimeout(connectTimeoutHandle);
      ws = null;
      setStatus("disconnected");
      if (!closed) {
        log("Disconnected, scheduling reconnect...");
        scheduleReconnect();
      }
    });

    ws.on("error", (err) => {
      logError("WebSocket error.", err);
    });
  };

  const start = () => {
    closed = false;
    connect();
  };

  const stop = () => {
    closed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      try {
        ws.close(1000, "listener stopped");
      } catch {}
      ws = null;
    }
    setStatus("disconnected");
  };

  const getStatus = () => status;

  return { start, stop, getStatus };
}

module.exports = { createGatewayListener };
