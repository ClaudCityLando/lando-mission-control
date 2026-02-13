import { describe, expect, it } from "vitest";

import { parseRegistryData } from "@/features/mission-control/lib/parseRegistry";

describe("parseRegistryData", () => {
  it("maps openclawId to runtimeId and keeps logical id aliases", () => {
    const { agents } = parseRegistryData({
      agents: {
        lando: {
          name: "Lando",
          openclawId: "main",
          role: "Lead",
          level: "lead",
          domains: ["orchestration"],
        },
      },
      domainMap: {},
    });

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      id: "lando",
      runtimeId: "main",
      idAliases: ["lando", "main"],
    });
  });

  it("falls back runtimeId to logical id and includes spawnId as alias", () => {
    const { agents } = parseRegistryData({
      agents: {
        sabine: {
          name: "Sabine",
          spawnId: "sabine-queue",
          role: "Frontend",
          level: "specialist",
          domains: ["frontend"],
        },
      },
      domainMap: {},
    });

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      id: "sabine",
      runtimeId: "sabine",
      idAliases: ["sabine", "sabine-queue"],
    });
  });
});
