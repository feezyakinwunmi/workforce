"use client";

/**
 * Edit one post: flyer text (the flyer redraws as you type), each platform's caption with a Copy
 * button, and the planned time. Saving keeps everything; posting itself is done by the person
 * for now (automatic posting comes with the social connections in the next step).
 */
import { useActionState, useMemo, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { PLATFORMS, type Brand, type Flyer, type FlyerStyle, type PadiPost } from "@/lib/padi/types";
import { FlyerCanvas } from "../../../flyer";
import { savePostEdits } from "../../actions";

/** ISO UTC → "YYYY-MM-DDTHH:MM" in Lagos time, for <input type="datetime-local">. */
const toLagosInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 3600_000).toISOString().slice(0, 16) : "");

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export function PostEditor({ post, brand }: { post: PadiPost; brand: Brand }) {
  const [state, action] = useActionState(savePostEdits, undefined);
  const [flyer, setFlyer] = useState<Flyer>({ style: "bold", ...post.flyer });
  const [captions, setCaptions] = useState(post.captions);
  const tags = post.hashtags.join(" ");
  const brandLook = useMemo(
    () => ({ name: brand.name, contact: brand.contact, primary: brand.colors.primary, accent: brand.colors.accent }),
    [brand],
  );
  const platforms = PLATFORMS.filter((p) => brand.platforms.includes(p.key) || captions[p.key]);

  return (
    <form action={action} className="mt-6 grid gap-6 lg:grid-cols-[22rem_1fr]">
      <input type="hidden" name="id" value={post.id} />

      {/* Flyer ---------------------------------------------------------------- */}
      <div className="space-y-4">
        <FlyerCanvas flyer={flyer} brand={brandLook} fileName={post.topic.replace(/[^\w-]+/g, "-").slice(0, 40) || "flyer"} />
        <div className="card space-y-3 p-4">
          <h2 className="font-semibold text-slate-900">Flyer text</h2>
          {(["headline", "subline", "cta"] as const).map((k) => (
            <div key={k}>
              <label className="label" htmlFor={k}>{k === "cta" ? "Button" : k === "headline" ? "Headline" : "Second line"}</label>
              <input className="input" id={k} name={k} value={flyer[k] ?? ""} maxLength={k === "subline" ? 110 : k === "cta" ? 30 : 60}
                onChange={(e) => setFlyer((f) => ({ ...f, [k]: e.target.value }))} />
            </div>
          ))}
          <div>
            <span className="label">Style</span>
            <input type="hidden" name="style" value={flyer.style} />
            <div className="grid grid-cols-4 gap-1.5">
              {(["bold", "clean", "promo", "quote"] as FlyerStyle[]).map((s) => (
                <button key={s} type="button" onClick={() => setFlyer((f) => ({ ...f, style: s }))} aria-pressed={flyer.style === s}
                  className={`rounded-lg border px-2 py-1.5 text-xs capitalize ${flyer.style === s ? "border-brand-500 bg-brand-50 font-medium text-brand-800" : "border-slate-200 text-slate-600"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Captions + time --------------------------------------------------------- */}
      <div className="space-y-4">
        <div className="card flex flex-wrap items-end gap-4 p-4">
          <div>
            <label className="label" htmlFor="planned_for">Post on (Lagos time)</label>
            <input className="input" type="datetime-local" id="planned_for" name="planned_for" defaultValue={toLagosInput(post.planned_for)} />
          </div>
          {tags && (
            <div className="min-w-0 flex-1">
              <span className="label">Hashtags</span>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm text-brand-700">{tags}</p>
                <CopyButton text={tags} />
              </div>
            </div>
          )}
        </div>

        {platforms.map((p) => (
          <div key={p.key} className="card p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="font-semibold text-slate-900" htmlFor={`caption_${p.key}`}>{p.label}</label>
              <CopyButton text={(captions[p.key] ?? "") + (p.key === "instagram" && tags ? `\n\n${tags}` : "")} />
            </div>
            <textarea
              id={`caption_${p.key}`}
              name={`caption_${p.key}`}
              className="input min-h-32"
              maxLength={2200}
              value={captions[p.key] ?? ""}
              onChange={(e) => setCaptions((c) => ({ ...c, [p.key]: e.target.value }))}
              placeholder={`No ${p.label} caption yet`}
            />
          </div>
        ))}

        <FormMessage state={state} />
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}
