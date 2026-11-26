"use client";

/**
 * Bizz Padi error screen (26 Nov 2026). Replaces Next's generic "This page couldn't load" so the
 * person can retry in place, and shows the actual error text so it can be reported and fixed.
 * Also logs it to the browser console with a "[padi]" tag.
 */
import { useEffect } from "react";

export default function PadiError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[padi] page error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Something went wrong on this page</h1>
      <p className="mt-2 text-sm text-slate-600">Try again. If it keeps happening, send Femi the text in the box.</p>
      <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-100 p-3 text-left text-xs whitespace-pre-wrap text-slate-700">
        {error.message || "Unknown error"}
        {error.digest ? `\n(ref ${error.digest})` : ""}
      </pre>
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={() => reset()} className="btn-primary">Try again</button>
        <button onClick={() => window.location.reload()} className="btn-secondary">Reload page</button>
      </div>
    </div>
  );
}
