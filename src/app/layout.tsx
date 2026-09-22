import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { isAdaptiveAvailable, adaptiveModel } from "@/lib/ai/capability";
import { getShellCounts } from "@/lib/queries";
import { isPublicDemo, READ_ONLY_REASON } from "@/lib/demo-mode";
import { DemoModeProvider } from "@/components/demo-mode";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "Poka Sales Engine — Technical Sales Operations",
  description:
    "An independent demonstration of an agent-assisted technical sales workspace: inbound industrial requests turned into evidence-backed, approval-gated quotations. All data is synthetic.",
};

// The sidebar carries live counts, so the shell reads the database per request.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const counts = await getShellCounts();
  const model = isAdaptiveAvailable() ? adaptiveModel() : null;
  const readOnly = isPublicDemo();
  return (
    <html lang="en" className={`h-full ${inter.variable} ${jetbrains.variable}`}>
      <body className="h-full">
        <DemoModeProvider readOnly={readOnly} reason={READ_ONLY_REASON}>
          <AppShell adaptiveModel={model} counts={counts} publicDemo={readOnly}>
            {children}
          </AppShell>
        </DemoModeProvider>
      </body>
    </html>
  );
}
