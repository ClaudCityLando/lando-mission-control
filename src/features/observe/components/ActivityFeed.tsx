"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { isNearBottom } from "@/lib/dom";
import type { ObserveEntry } from "../state/types";
import { ActivityFeedEntry } from "./ActivityFeedEntry";
import { ConversationFeedEntry } from "./ConversationFeedEntry";
import { buildSessionStyleMap } from "../lib/sessionClassifier";

type ActivityFeedProps = {
  entries: ObserveEntry[];
  sessionFilter: string | null;
  /** Enable conversation-style rendering for chat sessions */
  conversationMode?: boolean;
  /** Callback when a persisted activity entry is clicked (for drill-down) */
  onActivityClick?: (activityId: string) => void;
};

export const ActivityFeed = ({
  entries,
  sessionFilter,
  conversationMode = false,
  onActivityClick,
}: ActivityFeedProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  const filtered = useMemo(() => {
    const base = sessionFilter
      ? entries.filter((e) => e.sessionKey === sessionFilter)
      : entries;
    if (!conversationMode) return base;
    // Sort by timestamp so history from multiple sessions interleaves correctly
    return [...base].sort((a, b) => a.timestamp - b.timestamp);
  }, [entries, sessionFilter, conversationMode]);

  // Build style map only when conversation mode is active
  const styleMap = useMemo(() => {
    if (!conversationMode) return null;
    return buildSessionStyleMap(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationMode, filtered.length]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    shouldAutoScroll.current = isNearBottom({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !shouldAutoScroll.current) return;
    el.scrollTop = el.scrollHeight;
  }, [filtered.length]);

  const handleEntryClick = (entry: ObserveEntry) => {
    if (entry.activityId && onActivityClick) {
      onActivityClick(entry.activityId);
    }
  };

  const renderEntry = (entry: ObserveEntry) => {
    const isClickable = Boolean(entry.activityId && onActivityClick);

    if (!conversationMode) {
      return (
        <div
          key={entry.id}
          onClick={isClickable ? () => handleEntryClick(entry) : undefined}
          className={isClickable ? "cursor-pointer hover:bg-muted/20" : ""}
        >
          <ActivityFeedEntry entry={entry} />
        </div>
      );
    }

    const sessionStyle = entry.sessionKey
      ? styleMap?.get(entry.sessionKey)
      : "agentic";

    if (sessionStyle === "conversation") {
      // Skip lifecycle and delta events in conversation mode
      if (entry.stream === "lifecycle") return null;
      if (entry.isDeltaLike || entry.chatState === "delta") return null;
      return (
        <div
          key={entry.id}
          onClick={isClickable ? () => handleEntryClick(entry) : undefined}
          className={isClickable ? "cursor-pointer hover:bg-muted/20" : ""}
        >
          <ConversationFeedEntry entry={entry} />
        </div>
      );
    }

    return (
      <div
        key={entry.id}
        onClick={isClickable ? () => handleEntryClick(entry) : undefined}
        className={isClickable ? "cursor-pointer hover:bg-muted/20" : ""}
      >
        <ActivityFeedEntry entry={entry} />
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Activity Feed
          {sessionFilter && (
            <span className="ml-2 text-primary/70">
              ({sessionFilter.slice(0, 20)})
            </span>
          )}
        </h2>
        <span className="font-mono text-[10px] text-muted-foreground/60">
          {filtered.length} events
        </span>
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground/50">
            Waiting for events...
          </div>
        ) : (
          filtered.map(renderEntry)
        )}
      </div>
    </div>
  );
};
