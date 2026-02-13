import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { AgentFleetCard } from "@/features/mission-control/components/AgentFleetCard";
import type { AgentInfo, TaskItem } from "@/features/mission-control/state/types";
import type { SessionStatus } from "@/features/observe/state/types";

const agent: AgentInfo = {
  id: "lando",
  runtimeId: "main",
  idAliases: ["lando", "main"],
  name: "Lando",
  role: "Lead operator",
  level: "lead",
  domains: ["orchestration"],
  capacity: {
    maxConcurrent: 2,
    note: "",
  },
  notes: "",
};

const sessions: SessionStatus[] = [
  {
    sessionKey: "agent:main:studio:session-a",
    agentId: "main",
    displayName: "main",
    origin: "interactive",
    status: "running",
    lastActivityAt: 100,
    currentToolName: "write",
    currentToolArgs: "{\"path\":\"notes.md\"}",
    currentActivity: "Writing draft...",
    streamingText: null,
    lastError: null,
    eventCount: 3,
  },
];

const tasks: TaskItem[] = [
  {
    id: "task-1",
    title: "Draft notes",
    source: "beads",
    priority: "high",
    status: "in_progress",
    domain: "docs",
    assigned_to: "main",
    created: "2026-02-01T00:00:00.000Z",
    updated: "2026-02-01T00:05:00.000Z",
  },
  {
    id: "task-2",
    title: "Done task",
    source: "beads",
    priority: "low",
    status: "done",
    domain: "docs",
    assigned_to: "main",
    created: "2026-02-01T00:00:00.000Z",
    updated: "2026-02-01T00:05:00.000Z",
  },
];

describe("AgentFleetCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("uses runtime aliases to show running status and active capacity", () => {
    render(createElement(AgentFleetCard, { agent, sessions, tasks }));

    expect(screen.getByText("Lando")).toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByText("Writing draft...")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("shows activity from the freshest running session", () => {
    const multiSessions: SessionStatus[] = [
      {
        sessionKey: "agent:main:studio:older",
        agentId: "main",
        displayName: "main",
        origin: "interactive",
        status: "running",
        lastActivityAt: 100,
        currentToolName: null,
        currentToolArgs: null,
        currentActivity: "Older activity",
        streamingText: null,
        lastError: null,
        eventCount: 2,
      },
      {
        sessionKey: "agent:main:studio:newer",
        agentId: "main",
        displayName: "main",
        origin: "interactive",
        status: "running",
        lastActivityAt: 200,
        currentToolName: null,
        currentToolArgs: null,
        currentActivity: "Newest activity",
        streamingText: null,
        lastError: null,
        eventCount: 4,
      },
    ];

    render(createElement(AgentFleetCard, { agent, sessions: multiSessions, tasks }));

    expect(screen.getByText("Newest activity")).toBeInTheDocument();
    expect(screen.queryByText("Older activity")).not.toBeInTheDocument();
  });
});
