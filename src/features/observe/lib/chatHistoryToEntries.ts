import { parseAgentIdFromSessionKey } from "@/lib/gateway/GatewayClient";
import {
  extractText,
  parseEnvelope,
  stripUiMetadata,
} from "@/lib/text/message-extract";
import type { ObserveEntry } from "../state/types";

/** Sentinel values openclaw uses as placeholders */
const CHAT_SENTINELS = new Set(["NO_", "NO", "NO_REPLY"]);

type ChatHistoryMessage = Record<string, unknown>;

let historyCounter = 0;

const nextHistoryId = (): string => {
  historyCounter += 1;
  return `hist-${historyCounter}`;
};

const truncate = (text: string | null, maxLen = 200): string | null => {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen) + "...";
};

/**
 * Convert chat.history messages into ObserveEntry items for display
 * in the conversation feed.
 */
export const chatHistoryToEntries = (
  messages: ChatHistoryMessage[],
  sessionKey: string
): ObserveEntry[] => {
  const entries: ObserveEntry[] = [];
  const agentId = parseAgentIdFromSessionKey(sessionKey);

  for (const msg of messages) {
    const role = typeof msg.role === "string" ? msg.role.trim().toLowerCase() : null;

    // Only show user and assistant messages in the conversation feed
    if (role !== "user" && role !== "assistant") continue;

    // Extract raw text before any processing (for envelope parsing)
    const rawText = extractText(msg);

    // For user messages, parse envelope to get channel before stripping
    let channel: string | null = null;
    if (role === "user" && rawText) {
      // extractText strips envelope for user role, so we need to check the
      // raw content directly
      const content = msg.content;
      const rawContent = typeof content === "string" ? content : null;
      if (rawContent) {
        const envelope = parseEnvelope(rawContent);
        channel = envelope.channel;
      }
    }

    // Get the clean display text
    let messageText = rawText ? stripUiMetadata(rawText).trim() : null;

    // Filter out sentinel values
    if (messageText && CHAT_SENTINELS.has(messageText)) {
      messageText = null;
    }

    // Skip entries with no meaningful text
    if (!messageText) continue;

    // Extract timestamp
    const timestamp =
      typeof msg.timestamp === "number"
        ? msg.timestamp
        : typeof msg.createdAt === "number"
          ? (msg.createdAt as number)
          : typeof msg.at === "number"
            ? (msg.at as number)
            : Date.now();

    const description =
      role === "user"
        ? `Prompt: ${truncate(messageText, 120)}`
        : `Response: ${truncate(messageText, 120)}`;

    entries.push({
      id: nextHistoryId(),
      timestamp,
      eventType: "chat",
      sessionKey,
      agentId,
      runId: null,
      stream: null,
      toolName: null,
      toolPhase: null,
      toolArgs: null,
      chatState: "final",
      errorMessage: null,
      text: truncate(messageText),
      fullText: messageText,
      description,
      severity: "info",
      rawStream: "chat",
      isDeltaLike: false,
      channel,
      messageRole: role as ObserveEntry["messageRole"],
    });
  }

  return entries;
};
