import type { Metadata } from "next";
import "./globals.css";
import { StudioShell } from "@/components/studio-shell";
export const metadata: Metadata = { title: "NELLWICK AI Film Studio", description: "A creative production workspace for AI films, series, and video content.", icons: { icon: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><StudioShell>{children}</StudioShell></body></html>;
}
