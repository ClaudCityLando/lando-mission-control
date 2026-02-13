const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { resolveStateDir } = require("./studio-settings");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTIVITY_DIR_NAME = "mission-control";
const ACTIVITY_FILE_NAME = "activity.jsonl";
const MAX_ACTIVITIES = 10000;
const TRUNCATE_TO = 8000;
const ACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const SWEEP_INTERVAL_MS = 60_000;

// Channel list mirrors src/lib/text/message-extract.ts ENVELOPE_CHANNELS
const ENVELOPE_PREFIX = /^\[([^\]]+)\]\s*/;
const ENVELOPE_CHANNELS = [
  "WebChat",
  "WhatsApp",
  "Telegram",
  "Signal",
  "Slack",
  "Discord",
  "iMessage",
  "Teams",
  "Matrix",
  "Zalo",
  "Zalo Personal",
  "BlueBubbles",
];

const CHAT_SENTINELS = new Set(["NO_", "NO", "NO_REPLY"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const truncate = (text, maxLen) => {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\u2026";
};

const extractAgentId = (payload) => {
  if (payload?.sessionKey) {
    const match = payload.sessionKey.match(/^agent:([^:]+):/);
    if (match) return match[1];
  }
  if (typeof payload?.agentId === "string" && payload.agentId.trim()) {
    return payload.agentId.trim();
  }
  return null;
};

const extractChannelFromEnvelope = (text) => {
  if (typeof text !== "string") return null;
  const match = text.match(ENVELOPE_PREFIX);
  if (!match) return null;
  const header = match[1] || "";
  for (const ch of ENVELOPE_CHANNELS) {
    if (header.startsWith(`${ch} `) || header === ch) return ch;
  }
  return null;
};

const extractMessageText = (message) => {
  if (!message || typeof message !== "object") return null;
  const content = message.content;
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (!trimmed || CHAT_SENTINELS.has(trimmed)) return null;
    return trimmed.slice(0, 500);
  }
  // content array (Claude format)
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === "object" && typeof block.text === "string") {
        const trimmed = block.text.trim();
        if (trimmed && !CHAT_SENTINELS.has(trimmed)) return trimmed.slice(0, 500);
      }
    }
  }
  if (typeof message.text === "string") {
    const trimmed = message.text.trim();
    if (trimmed && !CHAT_SENTINELS.has(trimmed)) return trimmed.slice(0, 500);
  }
  return null;
};

const stripEnvelopeFromText = (text) => {
  if (typeof text !== "string") return text;
  return text.replace(ENVELOPE_PREFIX, "");
};

// ---------------------------------------------------------------------------
// Activity Tracker
// ---------------------------------------------------------------------------

function createActivityTracker(options = {}) {
  const {
    stateDir: stateDirOverride,
    log = () => {},
    logError = (msg, err) => console.error(msg, err),
  } = options;

  // State
  let activities = [];
  const activitiesById = new Map();
  const accumulators = new Map(); // runId -> accumulator
  let sweepInterval = null;

  // Paths
  const stateDir = stateDirOverride || resolveStateDir();
  const activityDir = path.join(stateDir, ACTIVITY_DIR_NAME);
  const activityFilePath = path.join(activityDir, ACTIVITY_FILE_NAME);

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  const ensureDir = () => {
    if (!fs.existsSync(activityDir)) {
      fs.mkdirSync(activityDir, { recursive: true });
    }
  };

  const loadFromDisk = () => {
    if (!fs.existsSync(activityFilePath)) return;
    try {
      const raw = fs.readFileSync(activityFilePath, "utf-8");
      const lines = raw.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const activity = JSON.parse(line);
          if (activity && activity.id) {
            activities.push(activity);
            activitiesById.set(activity.id, activity);
          }
        } catch {
          // skip corrupt lines
        }
      }
      log(`Loaded ${activities.length} activities from disk.`);
      if (activities.length > MAX_ACTIVITIES) {
        compactActivities();
      }
    } catch (err) {
      logError("Failed to load activity log.", err);
    }
  };

  const appendToDisk = (activity) => {
    try {
      ensureDir();
      fs.appendFileSync(activityFilePath, JSON.stringify(activity) + "\n", "utf-8");
    } catch (err) {
      logError("Failed to append activity to disk.", err);
    }
  };

  const compactActivities = () => {
    activities = activities.slice(-TRUNCATE_TO);
    activitiesById.clear();
    for (const a of activities) {
      activitiesById.set(a.id, a);
    }
    try {
      ensureDir();
      const data = activities.map((a) => JSON.stringify(a)).join("\n") + "\n";
      fs.writeFileSync(activityFilePath, data, "utf-8");
      log(`Compacted activity log to ${activities.length} entries.`);
    } catch (err) {
      logError("Failed to compact activity log.", err);
    }
  };

  // -------------------------------------------------------------------------
  // Accumulators
  // -------------------------------------------------------------------------

  const createAccumulator = (runId, agentId, sessionKey, type) => ({
    id: crypto.randomUUID(),
    runId,
    agentId,
    sessionKey,
    channel: null,
    type,
    status: "active",
    startedAt: new Date().toISOString(),
    eventRefs: [],
    metrics: { messageCount: 0, toolCallCount: 0, tokenEstimate: 0 },
    userMessage: null,
    agentResponse: null,
    toolsUsed: [],
    errorMessage: null,
    lastEventAt: Date.now(),
  });

  const inferActivityType = (payload) => {
    const key = (payload?.sessionKey || "").toLowerCase();
    if (key.includes("cron:") || key.includes("isolated")) return "cron-execution";
    return "conversation-turn";
  };

  const buildSummary = (acc) => {
    const agent = acc.agentId || "unknown";
    const toolCount = acc.metrics.toolCallCount;
    const toolsStr = toolCount > 0 ? ` (${toolCount} tool calls)` : "";

    switch (acc.type) {
      case "conversation-turn": {
        const channel = acc.channel ? ` via ${acc.channel}` : "";
        const prompt = acc.userMessage
          ? truncate(stripEnvelopeFromText(acc.userMessage), 60)
          : "conversation";
        return `${agent}${channel}: ${prompt}${toolsStr}`;
      }
      case "cron-execution":
        return `${agent} cron run${toolsStr}`;
      case "tool-sequence": {
        const tools = acc.toolsUsed.slice(0, 3).join(", ");
        return `${agent} tool sequence: ${tools}${toolsStr}`;
      }
      case "error-incident":
        return `${agent} error: ${truncate(acc.errorMessage || "unknown", 80)}`;
      default:
        return `${agent} activity${toolsStr}`;
    }
  };

  const finalizeAccumulator = (acc) => {
    const completedAt = new Date().toISOString();
    const startMs = new Date(acc.startedAt).getTime();
    const durationMs = Date.now() - startMs;

    const activity = {
      id: acc.id,
      runId: acc.runId,
      agentId: acc.agentId,
      sessionKey: acc.sessionKey,
      channel: acc.channel,
      type: acc.type,
      status: acc.status === "active" ? "completed" : acc.status,
      startedAt: acc.startedAt,
      completedAt,
      duration: durationMs,
      summary: buildSummary(acc),
      eventRefs: acc.eventRefs.slice(0, 50),
      metrics: { ...acc.metrics },
    };

    activities.push(activity);
    activitiesById.set(activity.id, activity);
    appendToDisk(activity);

    if (activities.length > MAX_ACTIVITIES) {
      compactActivities();
    }

    return activity;
  };

  // -------------------------------------------------------------------------
  // Event processing
  // -------------------------------------------------------------------------

  const processEvent = (eventFrame) => {
    const event = eventFrame?.event;
    if (event === "presence" || event === "heartbeat") return;
    if (event !== "chat" && event !== "agent") return;

    const payload = eventFrame.payload;
    if (!payload || typeof payload !== "object") return;

    const runId = typeof payload.runId === "string" ? payload.runId.trim() : "";
    if (!runId) return;

    const agentId = extractAgentId(payload);
    const sessionKey = payload.sessionKey || null;
    const timestamp = Date.now();

    // Get or create accumulator for this run
    let acc = accumulators.get(runId);
    if (!acc) {
      const type = inferActivityType(payload);
      acc = createAccumulator(runId, agentId, sessionKey, type);
      accumulators.set(runId, acc);
    }

    acc.lastEventAt = timestamp;
    if (!acc.agentId && agentId) acc.agentId = agentId;
    if (!acc.sessionKey && sessionKey) acc.sessionKey = sessionKey;

    if (event === "chat") {
      processChatEvent(acc, payload, timestamp);
    } else {
      processAgentEvent(acc, payload, timestamp);
    }
  };

  const processChatEvent = (acc, payload, timestamp) => {
    const state = payload.state;
    const message = payload.message;
    const role =
      message && typeof message === "object" && typeof message.role === "string"
        ? message.role
        : null;

    // Extract channel from user envelope
    if (role === "user" && !acc.channel) {
      const rawContent =
        message && typeof message === "object" && typeof message.content === "string"
          ? message.content
          : null;
      if (rawContent) {
        acc.channel = extractChannelFromEnvelope(rawContent);
      }
    }

    if (state === "delta") {
      // Streaming noise — skip tracking in eventRefs to stay lean
      return;
    }

    if (state === "final") {
      acc.metrics.messageCount += 1;
      const text = extractMessageText(message);

      if (role === "user") {
        acc.userMessage = text;
        acc.eventRefs.push({ timestamp, type: "chat", stream: "final", brief: "user message" });
      } else if (role === "assistant") {
        acc.agentResponse = text;
        if (text) acc.metrics.tokenEstimate += Math.ceil(text.length / 4);
        acc.eventRefs.push({ timestamp, type: "chat", stream: "final", brief: "agent response" });

        // A final assistant message completes a conversation-turn
        if (acc.type === "conversation-turn") {
          acc.status = "completed";
          finalizeAndRemove(acc);
        }
      } else {
        acc.eventRefs.push({
          timestamp,
          type: "chat",
          stream: "final",
          brief: `${role || "unknown"} message`,
        });
      }
      return;
    }

    if (state === "error" || state === "aborted") {
      acc.status = "errored";
      acc.errorMessage = payload.errorMessage || `Chat ${state}`;
      acc.type = "error-incident";
      acc.eventRefs.push({ timestamp, type: "chat", stream: "error", brief: acc.errorMessage });
      finalizeAndRemove(acc);
    }
  };

  const processAgentEvent = (acc, payload, timestamp) => {
    const stream = payload.stream;
    const data = payload.data || {};

    if (stream === "lifecycle") {
      const phase = data.phase;
      if (phase === "start") {
        acc.eventRefs.push({ timestamp, type: "agent", stream: "lifecycle", brief: "start" });
        return;
      }
      if (phase === "end") {
        if (acc.status === "active") acc.status = "completed";
        finalizeAndRemove(acc);
        return;
      }
      if (phase === "error") {
        acc.status = "errored";
        acc.errorMessage = typeof data.error === "string" ? data.error : "Lifecycle error";
        acc.type = "error-incident";
        acc.eventRefs.push({
          timestamp,
          type: "agent",
          stream: "lifecycle",
          brief: acc.errorMessage,
        });
        finalizeAndRemove(acc);
        return;
      }
      return;
    }

    if (stream === "tool") {
      const toolName = typeof data.name === "string" ? data.name : "unknown";
      const toolPhase = typeof data.phase === "string" ? data.phase : null;

      if (toolPhase !== "result") {
        acc.metrics.toolCallCount += 1;
        if (!acc.toolsUsed.includes(toolName)) {
          acc.toolsUsed.push(toolName);
        }
      }
      acc.eventRefs.push({
        timestamp,
        type: "agent",
        stream: "tool",
        brief: toolPhase === "result" ? `${toolName} result` : `${toolName} call`,
      });

      // If we have tool events, this might be a tool-sequence rather than conversation
      if (
        acc.type === "conversation-turn" &&
        acc.metrics.toolCallCount > 0 &&
        acc.metrics.messageCount === 0
      ) {
        acc.type = "tool-sequence";
      }
      return;
    }

    if (stream === "assistant") {
      const text = typeof data.text === "string" ? data.text : null;
      if (text) {
        acc.metrics.tokenEstimate += Math.ceil(text.length / 4);
      }
      // Don't add ref for every assistant delta — too noisy
      return;
    }

    // Reasoning and other streams — skip refs to keep lean
  };

  const finalizeAndRemove = (acc) => {
    const activity = finalizeAccumulator(acc);
    accumulators.delete(acc.runId);
    log(`Activity ${activity.status}: ${activity.summary}`);
    return activity;
  };

  // -------------------------------------------------------------------------
  // Timeout sweep
  // -------------------------------------------------------------------------

  const sweepStaleAccumulators = () => {
    const now = Date.now();
    for (const [runId, acc] of accumulators) {
      if (now - acc.lastEventAt > ACTIVITY_TIMEOUT_MS) {
        if (acc.status === "active") acc.status = "completed";
        finalizeAndRemove(acc);
      }
    }
  };

  // -------------------------------------------------------------------------
  // Query API
  // -------------------------------------------------------------------------

  const queryActivities = (params = {}) => {
    const { agent, since, type, limit = 50 } = params;
    let results = activities;

    if (agent) {
      const lower = agent.toLowerCase();
      results = results.filter((a) => a.agentId?.toLowerCase() === lower);
    }
    if (since) {
      const sinceMs = typeof since === "number" ? since : new Date(since).getTime();
      if (!Number.isNaN(sinceMs)) {
        results = results.filter((a) => new Date(a.startedAt).getTime() >= sinceMs);
      }
    }
    if (type) {
      results = results.filter((a) => a.type === type);
    }

    return results.slice(-Math.min(limit, 200));
  };

  const getActivity = (id) => {
    return activitiesById.get(id) || null;
  };

  const buildDigest = (since) => {
    const sinceMs = typeof since === "number" ? since : new Date(since).getTime();
    if (Number.isNaN(sinceMs)) {
      return {
        since: new Date().toISOString(),
        duration: "0m",
        agents: {},
        totalActivities: 0,
        totalMessages: 0,
        totalErrors: 0,
        avgResponseTime: "N/A",
      };
    }

    const relevant = activities.filter((a) => new Date(a.startedAt).getTime() >= sinceMs);
    const agentsMap = {};
    let totalMessages = 0;
    let totalErrors = 0;
    let totalDuration = 0;
    let responseCount = 0;

    for (const a of relevant) {
      const agentKey = a.agentId || "unknown";
      if (!agentsMap[agentKey]) {
        agentsMap[agentKey] = {
          conversations: 0,
          cronRuns: 0,
          errors: 0,
          channels: new Set(),
        };
      }
      const stats = agentsMap[agentKey];

      if (a.type === "conversation-turn") stats.conversations += 1;
      if (a.type === "cron-execution") stats.cronRuns += 1;
      if (a.status === "errored") {
        stats.errors += 1;
        totalErrors += 1;
      }
      if (a.channel) stats.channels.add(a.channel);
      totalMessages += a.metrics?.messageCount || 0;
      if (a.duration && a.duration > 0) {
        totalDuration += a.duration;
        responseCount += 1;
      }
    }

    // Serialize Sets
    const agents = {};
    for (const [key, stats] of Object.entries(agentsMap)) {
      agents[key] = {
        conversations: stats.conversations,
        cronRuns: stats.cronRuns,
        errors: stats.errors,
        channels: Array.from(stats.channels),
      };
    }

    const durationMs = Date.now() - sinceMs;
    const hours = Math.floor(durationMs / 3600000);
    const minutes = Math.floor((durationMs % 3600000) / 60000);
    const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    const avgMs = responseCount > 0 ? Math.round(totalDuration / responseCount) : 0;
    const avgSec = Math.round(avgMs / 1000);
    const avgResponseTime = avgSec > 0 ? `${avgSec}s` : "N/A";

    return {
      since: new Date(sinceMs).toISOString(),
      duration: durationStr,
      agents,
      totalActivities: relevant.length,
      totalMessages,
      totalErrors,
      avgResponseTime,
    };
  };

  const getListenerStats = () => ({
    totalActivities: activities.length,
    activeAccumulators: accumulators.size,
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  const start = () => {
    loadFromDisk();
    sweepInterval = setInterval(sweepStaleAccumulators, SWEEP_INTERVAL_MS);
    log(`Activity tracker started. ${activities.length} historical activities loaded.`);
  };

  const stop = () => {
    if (sweepInterval) {
      clearInterval(sweepInterval);
      sweepInterval = null;
    }
    // Finalize remaining accumulators
    for (const [, acc] of accumulators) {
      if (acc.status === "active") acc.status = "completed";
      finalizeAccumulator(acc);
    }
    accumulators.clear();
  };

  return {
    start,
    stop,
    processEvent,
    queryActivities,
    getActivity,
    buildDigest,
    getListenerStats,
  };
}

module.exports = { createActivityTracker };
