const STORAGE_KEY = "mission-control-prefs";

export type MissionControlPrefs = {
  specialUpdatesCollapsed?: boolean;
  agentFilter?: string | null;
};

const DEFAULTS: MissionControlPrefs = {
  specialUpdatesCollapsed: false,
  agentFilter: null,
};

export const loadMcPrefs = (): MissionControlPrefs => {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<MissionControlPrefs>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
};

export const saveMcPrefs = (prefs: Partial<MissionControlPrefs>): void => {
  if (typeof window === "undefined") return;
  try {
    const current = loadMcPrefs();
    const merged = { ...current, ...prefs };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {}
};
