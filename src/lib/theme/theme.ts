export const THEME_STORAGE_KEY = "theme";
export const THEME_COOKIE_NAME = "theme";

export type ThemeMode = "light" | "dark";

export const parseTheme = (value: unknown): ThemeMode | null => {
  if (value === "light" || value === "dark") return value;
  return null;
};

export const serializeThemeCookie = (mode: ThemeMode): string => {
  return `${THEME_COOKIE_NAME}=${mode}; Path=/; Max-Age=31536000; SameSite=Lax`;
};

export const setThemeCookie = (mode: ThemeMode) => {
  if (typeof document === "undefined") return;
  document.cookie = serializeThemeCookie(mode);
};
