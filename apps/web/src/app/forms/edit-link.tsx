"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

/** "Need to change something?" with the private edit link (copy or open). */
export function EditLink({ href, embed = false }: { href: string; embed?: boolean }) {
  const [full, setFull] = useState(href);
  const [copied, setCopied] = useState(false);
  useEffect(() => setFull(new URL(href, window.location.href).toString()), [href]);
  return (
    <div className="mx-auto mt-6 max-w-md rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
      <p className="text-sm font-medium text-slate-800">Need to change something later?</p>
      <p className="mt-0.5 text-xs text-slate-500">Keep this private link. Anyone who has it can change your answers.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={async () => {
          try {
            await navigator.clipboard.writeText(full);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            window.prompt("Copy your edit link:", full);
          }
        }}>
          <Icon name="copy" className="h-4 w-4" /> {copied ? "Copied" : "Copy link"}
        </button>
        <a href={full} target={embed ? "_blank" : undefined} rel="noopener" className="btn-secondary btn-sm">
          <Icon name="pencil" className="h-4 w-4" /> Edit answers
        </a>
      </div>
    </div>
  );
}
