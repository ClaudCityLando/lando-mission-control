import { describe, expect, it } from "vitest";

import {
  buildAgentInstruction,
  extractText,
  extractTextCached,
  extractTextDeep,
  extractThinking,
  extractThinkingCached,
  extractToolLines,
  isUiMetadataPrefix,
  parseEnvelope,
  stripUiMetadata,
} from "@/lib/text/message-extract";

describe("message-extract", () => {
  it("strips envelope headers from user messages", () => {
    const message = {
      role: "user",
      content:
        "[Discord Guild #openclaw-studio channel id:123 +0s 2026-02-01 00:00 UTC] hello there",
    };

    expect(extractText(message)).toBe("hello there");
  });

  it("removes <thinking>/<analysis> blocks from assistant-visible text", () => {
    const message = {
      role: "assistant",
      content: "<thinking>Plan A</thinking>\n<analysis>Details</analysis>\nOk.",
    };

    expect(extractText(message)).toBe("Ok.");
  });

  it("extractTextCached matches extractText and is consistent", () => {
    const message = { role: "user", content: "plain text" };

    expect(extractTextCached(message)).toBe(extractText(message));
    expect(extractTextCached(message)).toBe("plain text");
    expect(extractTextCached(message)).toBe("plain text");
  });

  it("extractThinkingCached matches extractThinking and is consistent", () => {
    const message = {
      role: "assistant",
      content: [{ type: "thinking", thinking: "Plan A" }],
    };

    expect(extractThinkingCached(message)).toBe(extractThinking(message));
    expect(extractThinkingCached(message)).toBe("Plan A");
    expect(extractThinkingCached(message)).toBe("Plan A");
  });

  it("formats tool call + tool result lines", () => {
    const callMessage = {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "call-1",
          name: "functions.exec",
          arguments: { command: "echo hi" },
        },
      ],
    };

    const resultMessage = {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "functions.exec",
      details: { status: "ok", exitCode: 0 },
      content: "hi\n",
    };

    const callLines = extractToolLines(callMessage).join("\n");
    expect(callLines).toContain("[[tool]] functions.exec (call-1)");
    expect(callLines).toContain("\"command\": \"echo hi\"");

    const resultLines = extractToolLines(resultMessage).join("\n");
    expect(resultLines).toContain("[[tool-result]] functions.exec (call-1)");
    expect(resultLines).toContain("ok");
    expect(resultLines).toContain("hi");
  });

  it("does not treat normal messages as UI metadata", () => {
    const built = buildAgentInstruction({
      message: "hello",
    });

    expect(isUiMetadataPrefix(built)).toBe(false);
    expect(stripUiMetadata(built)).toBe("hello");
  });

  it("strips leading system event blocks from queued session updates", () => {
    const raw = `System: [2026-02-12 01:09:16 UTC] Exec failed (mild-she, signal SIGKILL)

[Thu 2026-02-12 01:14 UTC] nope none of those are it. keep looking
[message_id: e050a641-aa32-4950-8083-c3bb7efdfc6d]`;

    expect(stripUiMetadata(raw)).toBe("[Thu 2026-02-12 01:14 UTC] nope none of those are it. keep looking");
  });

  describe("parseEnvelope", () => {
    it("parses Telegram envelope and extracts channel", () => {
      const result = parseEnvelope(
        "[Telegram chat +0s 2026-02-12 18:31 UTC] Hello there"
      );
      expect(result.channel).toBe("Telegram");
      expect(result.metadata).toBe("Telegram chat +0s 2026-02-12 18:31 UTC");
      expect(result.body).toBe("Hello there");
    });

    it("parses Discord envelope and extracts channel", () => {
      const result = parseEnvelope(
        "[Discord Guild #openclaw-studio channel id:123 +0s 2026-02-01 00:00 UTC] test message"
      );
      expect(result.channel).toBe("Discord");
      expect(result.body).toBe("test message");
    });

    it("returns null channel for plain text without envelope", () => {
      const result = parseEnvelope("just a plain message");
      expect(result.channel).toBeNull();
      expect(result.metadata).toBeNull();
      expect(result.body).toBe("just a plain message");
    });

    it("returns null channel for non-channel brackets", () => {
      const result = parseEnvelope("[not-a-channel] some text");
      expect(result.channel).toBeNull();
      expect(result.body).toBe("[not-a-channel] some text");
    });

    it("parses WhatsApp envelope", () => {
      const result = parseEnvelope(
        "[WhatsApp +1234567890 2026-02-12 10:00 UTC] Hi"
      );
      expect(result.channel).toBe("WhatsApp");
      expect(result.body).toBe("Hi");
    });
  });

  describe("extractTextDeep", () => {
    it("returns standard extraction for normal messages", () => {
      const message = { role: "assistant", content: "Hello world" };
      expect(extractTextDeep(message)).toBe("Hello world");
    });

    it("falls back to data.content when standard extraction is short", () => {
      const payload = {
        content: "NO",
        data: { role: "assistant", content: "The actual response text here" },
      };
      expect(extractTextDeep(payload)).toBe("The actual response text here");
    });

    it("falls back to data.text when standard extraction fails", () => {
      const payload = {
        data: { text: "Nested text content" },
      };
      expect(extractTextDeep(payload)).toBe("Nested text content");
    });

    it("checks content as object with nested text field", () => {
      const payload = {
        content: { text: "Content text field" },
      };
      expect(extractTextDeep(payload)).toBe("Content text field");
    });

    it("checks alternative top-level fields", () => {
      const payload = {
        response: "The response body",
      };
      expect(extractTextDeep(payload)).toBe("The response body");
    });

    it("returns null for empty/null input", () => {
      expect(extractTextDeep(null)).toBeNull();
      expect(extractTextDeep(undefined)).toBeNull();
    });

    it("returns standard result when standard extraction is long enough", () => {
      const message = { role: "user", content: "Good enough text" };
      expect(extractTextDeep(message)).toBe("Good enough text");
    });
  });
});
