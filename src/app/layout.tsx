import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { providerStatus } from "@/lib/ai";

export const metadata: Metadata = {
  title: "Poka Sales Engine — Technical Sales Operations",
  description:
    "An agent-assisted workspace that turns inbound technical sales requests into evidence-backed, approval-gated quotations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const provider = providerStatus();
  return (
    <html lang="en" className="h-full">
      <body className="h-full">
        <AppShell provider={provider}>{children}</AppShell>
      </body>
    </html>
  );
}
