"use client";

import { Icon } from "@/components/icons";

export function PrintButton({ className = "btn-primary", label = "Print" }: { className?: string; label?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      <Icon name="printer" className="h-4 w-4" />
      {label}
    </button>
  );
}
