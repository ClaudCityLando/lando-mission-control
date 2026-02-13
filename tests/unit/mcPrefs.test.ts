import { describe, it, expect, beforeEach } from "vitest";
import { loadMcPrefs, saveMcPrefs } from "@/lib/storage/mcPrefs";

describe("mcPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaults when storage is empty", () => {
    const prefs = loadMcPrefs();
    expect(prefs.specialUpdatesCollapsed).toBe(false);
    expect(prefs.agentFilter).toBeNull();
  });

  it("saves and loads preferences", () => {
    saveMcPrefs({ specialUpdatesCollapsed: true });
    const prefs = loadMcPrefs();
    expect(prefs.specialUpdatesCollapsed).toBe(true);
    expect(prefs.agentFilter).toBeNull();
  });

  it("merges partial saves with existing prefs", () => {
    saveMcPrefs({ specialUpdatesCollapsed: true });
    saveMcPrefs({ agentFilter: "w1le" });
    const prefs = loadMcPrefs();
    expect(prefs.specialUpdatesCollapsed).toBe(true);
    expect(prefs.agentFilter).toBe("w1le");
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("mission-control-prefs", "not-json");
    const prefs = loadMcPrefs();
    expect(prefs.specialUpdatesCollapsed).toBe(false);
  });
});
