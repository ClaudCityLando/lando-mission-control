import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ThemeToggle } from "@/components/theme-toggle";
import { THEME_COOKIE_NAME } from "@/lib/theme/theme";

const buildMatchMedia = (matches: boolean) =>
  vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

describe("ThemeToggle", () => {
  const clearCookie = (name: string) => {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  };

  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    window.localStorage.clear();
    clearCookie(THEME_COOKIE_NAME);
    vi.stubGlobal("matchMedia", buildMatchMedia(false));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("applies and persists theme when toggled", () => {
    render(createElement(ThemeToggle));

    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("theme")).toBe("dark");
    expect(document.cookie).toContain("theme=dark");

    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem("theme")).toBe("light");
    expect(document.cookie).toContain("theme=light");
  });

  it("reads and applies stored theme on mount", async () => {
    window.localStorage.setItem("theme", "dark");

    render(createElement(ThemeToggle));

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
    expect(document.cookie).toContain("theme=dark");
  });
});
