import type { EventFrame } from "@/lib/gateway/GatewayClient";
import { parseAgentIdFromSessionKey } from "@/lib/gateway/GatewayClient";
import { classifyGatewayEventKind } from "@/features/agents/state/runtimeEventBridge";
import {
  extractTextDeep,
  parseEnvelope,
  isUiMetadataPrefix,
  stripUiMetadata,
} from "@/lib/text/message-extract";
import type {
  ChatEventPayload,
  AgentEventPayload,
} from "@/features/agents/state/runtimeEventBridge";
import type { ObserveEntry, ObserveAttributionSource } from "./types";

let entryCounter = 0;

const nextId = (): string => {
  entryCounter += 1;
  return `obs-${entryCounter}`;
};

const truncate = (
  text: string | null | undefined,
  maxLen: number = 200
): string | null => {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen) + "...";
};

const extractPayloadAgentId = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.agentId !== "string") return null;
  const trimmed = record.agentId.trim();
  return trimmed || null;
};

/** Sentinel values openclaw uses as placeholders in chat events */
const CHAT_SENTINELS = new Set(["NO_", "NO", "NO_REPLY"]);

const extractCleanMessageText = (message: unknown): string | null => {
  const raw = extractTextDeep(message);
  if (typeof raw !== "string") return null;
  const cleaned = stripUiMetadata(raw).trim();
  if (!cleaned) return null;
  if (CHAT_SENTINELS.has(cleaned)) return null;
  return cleaned;
};

const extractToolArgs = (data: Record<string, unknown>): string | null => {
  const raw = data.arguments ?? data.args ?? data.input ?? data.parameters;
  if (typeof raw === "string") return truncate(raw, 300);
  if (raw && typeof raw === "object") {
    try {
      return truncate(JSON.stringify(raw), 300);
    } catch {
      return null;
    }
  }
  return null;
};

const extractToolResult = (data: Record<string, unknown>): string | null => {
  const result = data.result;
  if (typeof result === "string") return truncate(result, 300);
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.content === "string") return truncate(r.content, 300);
    if (typeof r.text === "string") return truncate(r.text, 300);
    if (r.details && typeof r.details === "object") {
      const d = r.details as Record<string, unknown>;
      const parts: string[] = [];
      if (typeof d.exitCode === "number") parts.push(`exit ${d.exitCode}`);
      if (typeof d.durationMs === "number") parts.push(`${d.durationMs}ms`);
      if (parts.length > 0) return parts.join(", ");
    }
    try {
      return truncate(JSON.stringify(result), 300);
    } catch {
      return null;
    }
  }
  return null;
};

const describeToolCall = (name: string, args: string | null): string => {
  if (!args) return `Calling ${name}`;

  // Make common tools human-readable
  try {
    const parsed = JSON.parse(args);
    if (typeof parsed === "object" && parsed !== null) {
      if (name === "read" && typeof parsed.file_path === "string") {
        const file = parsed.file_path.split("/").pop();
        return `Reading ${file}`;
      }
      if (name === "exec" && typeof parsed.command === "string") {
        return `Running: ${truncate(parsed.command, 80)}`;
      }
      if (name === "browser" && typeof parsed.action === "string") {
        return `Browser: ${parsed.action}${parsed.url ? ` — ${truncate(parsed.url, 60)}` : ""}`;
      }
      if (name === "write" && typeof parsed.file_path === "string") {
        const file = parsed.file_path.split("/").pop();
        return `Writing ${file}`;
      }
      if (name === "sessions_spawn" && typeof parsed.agentId === "string") {
        return `Spawning subagent: ${parsed.agentId}`;
      }
      if (name === "sessions_send" && typeof parsed.agentId === "string") {
        return `Sending message to ${parsed.agentId}`;
      }
    }
  } catch {
    // not JSON, fall through
  }

  return `Calling ${name}`;
};

const describeToolResult = (
  name: string,
  result: string | null,
  isError: boolean
): string => {
  if (isError) return `${name} failed${result ? `: ${truncate(result, 100)}` : ""}`;
  return `${name} completed`;
};

const mapChatEvent = (
  payload: ChatEventPayload,
  timestamp: number
): ObserveEntry | null => {
  const payloadAgentId = extractPayloadAgentId(payload);
  const parsedAgentId = payload.sessionKey
    ? parseAgentIdFromSessionKey(payload.sessionKey)
    : null;
  const agentId = parsedAgentId ?? payloadAgentId;

  console.info("[observe] chat event — sessionKey:", payload.sessionKey, "→ agentId:", agentId);

  const isError = payload.state === "error" || payload.state === "aborted";
  const messageText =
    extractCleanMessageText(payload.message) ??
    extractCleanMessageText(payload);
  const role =
    payload.message &&
    typeof payload.message === "object" &&
    typeof (payload.message as Record<string, unknown>).role === "string"
      ? ((payload.message as Record<string, unknown>).role as string)
      : null;
  const normalizedRole = role?.trim().toLowerCase() ?? null;
  const normalizedError = payload.errorMessage?.trim() ?? "";
  const hasUiPrefix = messageText ? isUiMetadataPrefix(messageText) : false;

  // Parse channel from envelope header (user messages only).
  // We read the raw content directly because extractText strips the envelope.
  const rawMessageContent =
    payload.message && typeof payload.message === "object"
      ? (payload.message as Record<string, unknown>).content
      : null;
  const rawContentStr =
    typeof rawMessageContent === "string" ? rawMessageContent : null;
  const envelope =
    rawContentStr && normalizedRole === "user"
      ? parseEnvelope(rawContentStr)
      : null;
  const channel = envelope?.channel ?? null;

  // Diagnostic: log when extraction produces very short results
  if (
    payload.state === "final" &&
    (!messageText || messageText.length < 5) &&
    payload.message
  ) {
    console.debug(
      "[observe] short extraction for chat final — raw payload.message:",
      JSON.stringify(payload.message).slice(0, 500)
    );
  }

  let description: string;
  if (payload.state === "delta") {
    if (normalizedRole !== "assistant") return null;
    if (!messageText || hasUiPrefix) return null;
    description =
      messageText
        ? `Writing: ${truncate(messageText, 100)}`
        : "Writing response...";
  } else if (isError) {
    description = normalizedError || "Session error";
  } else if (payload.state === "final") {
    if (normalizedRole === "assistant") {
      description = messageText
        ? `Response: ${truncate(messageText, 120)}`
        : "Response complete";
    } else if (normalizedRole === "user") {
      description = messageText
        ? `Prompt: ${truncate(messageText, 120)}`
        : "User message received";
    } else {
      description = "Message received";
    }
  } else {
    description = "Chat event";
  }

  return {
    id: nextId(),
    timestamp,
    eventType: "chat",
    sessionKey: payload.sessionKey ?? null,
    agentId,
    runId: payload.runId ?? null,
    stream: null,
    toolName: null,
    toolPhase: null,
    toolArgs: null,
    chatState: payload.state ?? null,
    errorMessage: isError ? (normalizedError || "Chat error") : null,
    text: truncate(messageText),
    fullText: messageText ?? null,
    description,
    severity: isError ? "error" : "info",
    attributionSource: payload.sessionKey ? "sessionKey" : undefined,
    rawStream: "chat",
    isDeltaLike: payload.state === "delta",
    channel,
    messageRole: (normalizedRole as ObserveEntry["messageRole"]) ?? null,
  };
};

const mapAgentEvent = (
  payload: AgentEventPayload,
  timestamp: number
): ObserveEntry | null => {
  const sessionKey = payload.sessionKey ?? null;
  const payloadAgentId = extractPayloadAgentId(payload);
  const agentId = sessionKey
    ? parseAgentIdFromSessionKey(sessionKey)
    : payloadAgentId;
  const stream = payload.stream ?? null;

  console.info("[observe] agent event — sessionKey:", sessionKey, "→ agentId:", agentId, "stream:", stream);
  const data = payload.data ?? {};

  let toolName: string | null = null;
  let toolPhase: string | null = null;
  let toolArgs: string | null = null;
  let text: string | null = null;
  let errorMessage: string | null = null;
  let severity: ObserveEntry["severity"] = "info";
  const attributionSource: ObserveAttributionSource | undefined =
    sessionKey ? "sessionKey" : undefined;
  let isDeltaLike = false;
  let description: string;

  if (stream === "lifecycle") {
    const phase = typeof data.phase === "string" ? data.phase : null;
    if (phase === "start") {
      description = "Session started";
    } else if (phase === "end") {
      description = "Session ended";
    } else if (phase === "error") {
      severity = "error";
      errorMessage =
        typeof data.error === "string" ? data.error : "Session error";
      description = `Session error: ${truncate(errorMessage, 100)}`;
    } else {
      description = `Lifecycle: ${phase ?? "unknown"}`;
    }
    text = phase;
  } else if (stream === "tool") {
    toolName = typeof data.name === "string" ? data.name : null;
    toolPhase = typeof data.phase === "string" ? data.phase : null;
    const isResult = toolPhase === "result";
    const isError =
      data.isError === true ||
      typeof data.error === "string";

    if (isError) {
      severity = "error";
      errorMessage =
        typeof data.error === "string"
          ? data.error
          : "Tool error";
    }

    if (isResult) {
      const resultText = extractToolResult(data);
      text = resultText;
      description = describeToolResult(
        toolName ?? "tool",
        resultText,
        isError
      );
    } else {
      toolArgs = extractToolArgs(data);
      text = toolArgs;
      description = describeToolCall(toolName ?? "tool", toolArgs);
    }
  } else if (stream === "assistant") {
    const raw =
      typeof data.text === "string"
        ? stripUiMetadata(data.text).trim()
        : null;
    const delta =
      typeof data.delta === "string"
        ? stripUiMetadata(data.delta).trim()
        : null;
    // Only emit entries for meaningful text updates, not every delta
    if (!raw && !delta) return null;
    isDeltaLike = Boolean(delta);
    text = truncate(raw ?? delta);
    description = text ? `Writing: ${truncate(text, 100)}` : "Thinking...";
  } else {
    // reasoning / other streams; keep phase-only markers to avoid dropping useful state.
    const raw = typeof data.text === "string" ? data.text : null;
    const delta = typeof data.delta === "string" ? data.delta : null;
    const phase = typeof data.phase === "string" ? data.phase : null;
    const status = typeof data.status === "string" ? data.status : null;
    if (!raw && !delta && !phase && !status) return null;
    isDeltaLike = Boolean(delta);
    if (typeof data.error === "string") {
      severity = "error";
      errorMessage = data.error;
    }
    text = truncate(raw ?? delta ?? phase ?? status);
    if (phase || status) {
      description = `${stream ?? "activity"}: ${truncate(phase ?? status, 80)}`;
    } else {
      description = "Thinking...";
    }
  }

  return {
    id: nextId(),
    timestamp,
    eventType: "agent",
    sessionKey,
    agentId,
    runId: payload.runId ?? null,
    stream,
    toolName,
    toolPhase,
    toolArgs,
    chatState: null,
    errorMessage,
    text,
    description,
    severity,
    attributionSource,
    rawStream: stream,
    isDeltaLike,
  };
};

export const mapEventFrameToEntry = (
  event: EventFrame
): ObserveEntry | null => {
  const timestamp = Date.now();
  const kind = classifyGatewayEventKind(event.event);

  if (kind === "runtime-chat") {
    const payload = event.payload as ChatEventPayload | undefined;
    if (!payload) return null;
    return mapChatEvent(payload, timestamp);
  }

  if (kind === "runtime-agent") {
    const payload = event.payload as AgentEventPayload | undefined;
    if (!payload) return null;
    return mapAgentEvent(payload, timestamp);
  }

  // Skip heartbeat and presence from the feed — too noisy, no useful info
  return null;
};
