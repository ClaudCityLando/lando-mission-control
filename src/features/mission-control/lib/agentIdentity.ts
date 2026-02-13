import type { AgentInfo } from "../state/types";

const normalizeMaybe = (value: string | null | undefined): string => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

export const normalizeId = (value: string): string => normalizeMaybe(value);

export const buildAliasSet = (agent: AgentInfo): Set<string> => {
  const aliases = [agent.id, agent.runtimeId, ...agent.idAliases]
    .map((value) => normalizeMaybe(value))
    .filter(Boolean);
  return new Set(aliases);
};

export const sessionBelongsToAgent = (
  sessionAgentId: string | null | undefined,
  agent: AgentInfo
): boolean => {
  const normalized = normalizeMaybe(sessionAgentId);
  if (!normalized) return false;
  return buildAliasSet(agent).has(normalized);
};

export const taskBelongsToAgent = (
  taskAssignedTo: string | null | undefined,
  agent: AgentInfo
): boolean => {
  const normalized = normalizeMaybe(taskAssignedTo);
  if (!normalized) return false;
  const logicalId = normalizeMaybe(agent.id);
  if (logicalId && normalized === logicalId) return true;
  return buildAliasSet(agent).has(normalized);
};
