import { describe, expect, it } from "vitest";

import type { AgentInfo } from "@/features/mission-control/state/types";
import {
  buildAliasSet,
  normalizeId,
  sessionBelongsToAgent,
  taskBelongsToAgent,
} from "@/features/mission-control/lib/agentIdentity";

const buildAgent = (): AgentInfo => ({
  id: "lando",
  runtimeId: "main",
  idAliases: ["lando", "main", "lando-queue"],
  name: "Lando",
  role: "Lead",
  level: "lead",
  domains: ["orchestration"],
  capacity: {
    maxConcurrent: 3,
    note: "",
  },
  notes: "",
});

describe("mission-control agent identity matching", () => {
  it("normalizes identifiers consistently", () => {
    expect(normalizeId("  MAIN  ")).toBe("main");
  });

  it("builds alias set from logical and runtime ids", () => {
    const aliases = buildAliasSet(buildAgent());
    expect(Array.from(aliases).sort()).toEqual(["lando", "lando-queue", "main"]);
  });

  it("matches sessions against runtime aliases", () => {
    const agent = buildAgent();
    expect(sessionBelongsToAgent(" main ", agent)).toBe(true);
    expect(sessionBelongsToAgent("LANDO-QUEUE", agent)).toBe(true);
    expect(sessionBelongsToAgent("sabine", agent)).toBe(false);
  });

  it("matches task assignment against aliases and logical id", () => {
    const agent = buildAgent();
    expect(taskBelongsToAgent("main", agent)).toBe(true);
    expect(taskBelongsToAgent("lando", agent)).toBe(true);
    expect(taskBelongsToAgent("unknown", agent)).toBe(false);
  });
});
