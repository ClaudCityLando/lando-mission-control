"use client";

import { useState } from "react";
import type { ObserveEntry } from "../state/types";

type ConversationFeedEntryProps = {
  entry: ObserveEntry;
};

const TRUNCATE_LENGTH = 200;

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const TZ_SHORT =
  Intl.DateTimeFormat().resolvedOptions().timeZone
    .replace(/^.*\//, "")
    .replace(/_/g, " ") ||
  new Date()
    .toLocaleTimeString("en-US", { timeZoneName: "short" })
    .split(" ")
    .pop() ||
  "";

const fmt12 = (d: Date): string => {
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m} ${ampm}`;
};

const formatTimestamp = (ts: number): string => {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = fmt12(d);
  if (isToday) return `${time} ${TZ_SHORT}`;
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()} ${time} ${TZ_SHORT}`;
};

const channelColors: Record<string, string> = {
  Telegram: "bg-blue-500/15 text-blue-400",
  Discord: "bg-indigo-500/15 text-indigo-400",
  WhatsApp: "bg-emerald-500/15 text-emerald-400",
  Slack: "bg-purple-500/15 text-purple-400",
  Signal: "bg-sky-500/15 text-sky-400",
  iMessage: "bg-green-500/15 text-green-400",
  WebChat: "bg-zinc-500/15 text-zinc-400",
  Teams: "bg-violet-500/15 text-violet-400",
  Matrix: "bg-teal-500/15 text-teal-400",
};

const getChannelStyle = (channel: string): string =>
  channelColors[channel] ?? "bg-muted/50 text-muted-foreground";

export const ConversationFeedEntry = ({
  entry,
}: ConversationFeedEntryProps) => {
  const [expanded, setExpanded] = useState(false);

  const isUser = entry.messageRole === "user";
  const isAssistant = entry.messageRole === "assistant";

  // For system/lifecycle events within a conversation, show minimally
  if (!isUser && !isAssistant) {
    return (
      <div className="flex justify-center px-3 py-1">
        <span className="text-[10px] text-muted-foreground/40">
          {entry.description}
        </span>
      </div>
    );
  }

  const displayText = entry.fullText ?? entry.text ?? entry.description;
  const needsTruncation = displayText.length > TRUNCATE_LENGTH;
  const shownText =
    expanded || !needsTruncation
      ? displayText
      : displayText.slice(0, TRUNCATE_LENGTH) + "\u2026";

  const agentLabel = entry.agentId ?? "agent";

  return (
    <div
      className={`flex flex-col gap-0.5 px-3 py-2 ${
        isUser ? "items-end" : "items-start"
      }`}
    >
      {/* Header: name + channel badge + time */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
        <span className="font-semibold">
          {isUser ? "User" : agentLabel}
        </span>
        {entry.channel && (
          <span
            className={`rounded px-1 py-0.5 text-[9px] font-semibold ${getChannelStyle(
              entry.channel
            )}`}
          >
            {entry.channel}
          </span>
        )}
        <span>{formatTimestamp(entry.timestamp)}</span>
      </div>

      {/* Message bubble */}
      <button
        type="button"
        onClick={() => needsTruncation && setExpanded(!expanded)}
        className={`max-w-[85%] rounded-lg px-3 py-2 text-left text-[12px] leading-relaxed transition ${
          isUser
            ? "bg-primary/15 text-foreground"
            : "bg-muted/30 text-foreground/90"
        } ${
          needsTruncation
            ? "cursor-pointer hover:bg-muted/40"
            : "cursor-default"
        }`}
      >
        <span className="whitespace-pre-wrap break-words">{shownText}</span>
        {needsTruncation && !expanded && (
          <span className="ml-1 text-[10px] text-primary/60">show more</span>
        )}
        {needsTruncation && expanded && (
          <span className="ml-1 text-[10px] text-primary/60">show less</span>
        )}
      </button>
    </div>
  );
};
