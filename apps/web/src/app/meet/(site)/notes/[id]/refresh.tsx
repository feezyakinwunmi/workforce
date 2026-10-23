"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** While the notes are being written, look again every 5 seconds. */
export function RefreshWhileWorking() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

/** Copy the notes as plain text. */
export function CopyNotes({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="btn-secondary btn-sm"
      onClick={async (e) => {
        const b = e.currentTarget;
        await navigator.clipboard.writeText(text).catch(() => undefined);
        b.textContent = "Copied";
        setTimeout(() => (b.textContent = "Copy"), 1500);
      }}
    >
      Copy
    </button>
  );
}
