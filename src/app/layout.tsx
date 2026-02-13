import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Bebas_Neue, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { parseTheme, THEME_COOKIE_NAME } from "@/lib/theme/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenClaw Studio",
  description: "Focused operator studio for the OpenClaw gateway.",
};

const display = Bebas_Neue({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE_NAME)?.value);

  return (
    <html lang="en" suppressHydrationWarning className={theme === "dark" ? "dark" : undefined}>
      <head />
      <body className={`${display.variable} ${sans.variable} ${mono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
