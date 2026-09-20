"use client";

import { Button } from "@/components/ui/primitives";

export function PrintButton() {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()}>
      Print / save as PDF
    </Button>
  );
}
