import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { providerStatus } from "@/lib/ai";
import { isAdaptiveAvailable, adaptiveModel } from "@/lib/ai/capability";

export const metadata: Metadata = {
  title: "Poka Sales Engine — Technical Sales Operations",
  description:
    "An agent-assisted workspace that turns inbound technical sales requests into evidence-backed, approval-gated quotations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const provider = providerStatus();
  const adaptive = isAdaptiveAvailable() ? adaptiveModel() : null;
  return (
    <html lang="en" className="h-full">
      <body className="h-full">
        <AppShell provider={provider} adaptiveModel={adaptive}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
