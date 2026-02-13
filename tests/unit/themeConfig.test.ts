import { describe, expect, it } from "vitest";

import { parseTheme, serializeThemeCookie } from "@/lib/theme/theme";

describe("theme config", () => {
  it("parses supported theme values", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
  });

  it("rejects unsupported theme values", () => {
    expect(parseTheme("system")).toBeNull();
    expect(parseTheme("")).toBeNull();
    expect(parseTheme(null)).toBeNull();
    expect(parseTheme(undefined)).toBeNull();
  });

  it("serializes theme cookie attributes", () => {
    expect(serializeThemeCookie("dark")).toContain("theme=dark");
    expect(serializeThemeCookie("dark")).toContain("Path=/");
    expect(serializeThemeCookie("dark")).toContain("Max-Age=31536000");
    expect(serializeThemeCookie("dark")).toContain("SameSite=Lax");
  });
});
