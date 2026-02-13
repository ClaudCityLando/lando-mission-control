import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentInfo, DomainMap } from "../state/types";

const REGISTRY_PATH = path.join(
  process.env.HOME ?? "/Users/lando",
  ".openclaw/shared/agents/registry.json"
);

type RawRegistry = {
  agents: Record<
    string,
    {
      name?: string;
      openclawId?: string;
      role?: string;
      level?: string;
      domains?: string[];
      spawnId?: string | null;
      capacity?: { maxConcurrent?: number | null; note?: string };
      notes?: string;
    }
  >;
  domainMap?: Record<string, string[]>;
};

const normalizeAlias = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const buildAgentIdAliases = (
  id: string,
  runtimeId: string,
  spawnId?: string | null
): string[] => {
  const aliases = [id, runtimeId, spawnId ?? null]
    .map((value) => normalizeAlias(value))
    .filter((value): value is string => value !== null);
  return Array.from(new Set(aliases));
};

export const parseRegistryData = (
  data: RawRegistry
): {
  agents: AgentInfo[];
  domainMap: DomainMap;
} => {
  const agents: AgentInfo[] = Object.entries(data.agents ?? {}).map(([id, a]) => {
    const runtimeId = normalizeAlias(a.openclawId) ?? id;
    return {
      id,
      runtimeId,
      idAliases: buildAgentIdAliases(id, runtimeId, a.spawnId),
      name: a.name ?? id,
      role: a.role ?? "",
      level: (a.level as AgentInfo["level"]) ?? "specialist",
      domains: a.domains ?? [],
      capacity: {
        maxConcurrent: a.capacity?.maxConcurrent ?? null,
        note: a.capacity?.note ?? "",
      },
      notes: a.notes ?? "",
    };
  });

  const domainMap: DomainMap = data.domainMap ?? {};

  return { agents, domainMap };
};

export const parseRegistry = (): {
  agents: AgentInfo[];
  domainMap: DomainMap;
} => {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
    const data = JSON.parse(raw) as RawRegistry;
    return parseRegistryData(data);
  } catch {
    return { agents: [], domainMap: {} };
  }
};
