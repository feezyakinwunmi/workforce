"use client";

/**
 * Edit one post (redesigned 26 Nov 2026).
 *
 *   Left    the flyer (redraws as you type), Download, the design picker (9 designs) and
 *           "Your photo": add a picture (product, shop, yourself) for the Photo/Split/Frame
 *           designs, or upload your own finished flyer with "My design".
 *   Right   flyer text, posting time, hashtags and each platform's caption with Copy.
 *
 * Pictures are shrunk in the browser (longest side 1600 px, JPEG) and uploaded straight to the
 * private "padi-media" bucket in the person's own folder; Save stores the path on the post.
 */
import { useActionState, useMemo, useRef, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icons";
import { FLYER_STYLES, PLATFORMS, type Brand, type Flyer, type FlyerStyle, type PadiPost } from "@/lib/padi/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { FlyerCanvas } from "../../../flyer";
import { savePostEdits } from "../../actions";

/** ISO UTC → "YYYY-MM-DDTHH:MM" in Lagos time, for <input type="datetime-local">. */
const toLagosInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 3600_000).toISOString().slice(0, 16) : "");

/** Shrink a picture to at most 1600 px on its longest side and return a JPEG. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("shrink"))), "image/jpeg", 0.86));
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn-secondary btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}>
      <Icon name={done ? "check" : "copy"} className="h-3.5 w-3.5" />
      {done ? "Copied" : "Copy"}
    </button>
  );
}

/** A tiny drawn preview of each design for the picker. */
function StyleThumb({ style, primary, accent }: { style: FlyerStyle; primary: string; accent: string }) {
  const base = "relative block aspect-[4/5] w-full overflow-hidden rounded-lg";
  switch (style) {
    case "bold":
      return <span className={base} style={{ background: primary }}><i className="absolute -top-3 -right-3 h-10 w-10 rounded-full opacity-60 blur-md" style={{ background: accent }} /><i className="absolute bottom-3 left-2 h-1.5 w-8 rounded" style={{ background: accent }} /><i className="absolute bottom-5 left-2 h-2 w-10 rounded bg-white/90" /></span>;
    case "clean":
      return <span className={cn(base, "bg-[#fbfbfa] ring-1 ring-slate-200")}><i className="absolute inset-1 rounded border" style={{ borderColor: primary + "66" }} /><i className="absolute top-5 left-2 h-1 w-4" style={{ background: accent }} /><i className="absolute top-7 left-2 h-2 w-10 rounded" style={{ background: primary }} /></span>;
    case "minimal":
      return <span className={cn(base, "bg-[#0c0c0e]")}><i className="absolute top-2 right-2 left-2 h-px bg-white/60" /><i className="absolute top-6 left-2 h-1.5 w-9 rounded bg-white/50" /><i className="absolute top-9 left-2 h-2 w-11 rounded bg-white" /></span>;
    case "promo":
      return <span className={base} style={{ background: primary }}><i className="absolute top-1/2 -left-2 h-4 w-[130%] -translate-y-1/2 -rotate-6" style={{ background: accent }} /><i className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-white" /></span>;
    case "quote":
      return <span className={base} style={{ background: accent + "33" }}><b className="absolute top-0 left-1.5 text-2xl leading-none" style={{ color: primary }}>&ldquo;</b><i className="absolute top-8 left-2 h-1.5 w-10 rounded bg-slate-800/70" /><i className="absolute top-10.5 left-2 h-1.5 w-7 rounded bg-slate-800/70" /></span>;
    case "photo":
      return <span className={cn(base, "bg-gradient-to-b from-slate-300 to-slate-700")}><Icon name="camera" className="absolute top-3 left-1/2 h-4 w-4 -translate-x-1/2 text-white/80" /><i className="absolute bottom-3 left-2 h-2 w-10 rounded bg-white" /></span>;
    case "split":
      return <span className={base}><span className="absolute inset-x-0 top-0 h-[56%] bg-slate-300"><Icon name="camera" className="absolute top-1/2 left-1/2 h-4 w-4 -translate-1/2 text-white" /></span><span className="absolute inset-x-0 bottom-0 h-[44%]" style={{ background: primary }}><i className="absolute top-0 inset-x-0 h-0.5" style={{ background: accent }} /><i className="absolute top-2 left-2 h-1.5 w-9 rounded bg-white/90" /></span></span>;
    case "frame":
      return <span className={base} style={{ background: primary }}><span className="absolute top-2 left-1/2 h-9 w-10 -translate-x-1/2 -rotate-3 bg-white p-0.5"><span className="block h-full w-full bg-slate-300" /></span><i className="absolute bottom-3 left-1/2 h-1.5 w-9 -translate-x-1/2 rounded bg-white/90" /></span>;
    default:
      return <span className={cn(base, "flex items-center justify-center bg-slate-100 ring-1 ring-slate-200")}><Icon name="paperclip" className="h-5 w-5 text-slate-500" /></span>;
  }
}

export function PostEditor({ post, brand, imageUrl, userId }: { post: PadiPost; brand: Brand; imageUrl: string | null; userId: string }) {
  const [state, action] = useActionState(savePostEdits, undefined);
  const [flyer, setFlyer] = useState<Flyer>({ style: "bold", ...post.flyer });
  const [captions, setCaptions] = useState(post.captions);
  const [preview, setPreview] = useState<string | null>(imageUrl); // link drawn on the flyer
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const tags = post.hashtags.join(" ");
  const look = useMemo(() => ({ name: brand.name, contact: brand.contact, primary: brand.colors.primary, accent: brand.colors.accent }), [brand]);
  const platforms = PLATFORMS.filter((p) => brand.platforms.includes(p.key) || captions[p.key]);

  // Upload a picture to the person's own folder and switch to a photo design.
  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploadError("");
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setUploadError("Use a JPG, PNG or WebP picture.");
    setUploading(true);
    try {
      const blob = await shrink(file);
      const path = `${userId}/${crypto.randomUUID()}.jpg`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("padi-media").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      setPreview(URL.createObjectURL(blob));
      setFlyer((f) => ({ ...f, image: path, style: FLYER_STYLES.find((s) => s.key === f.style)?.photo ? f.style : "photo" }));
    } catch {
      setUploadError("Couldn't upload that picture. Try another one.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const textDisabled = flyer.style === "own";

  return (
    <form action={action} className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] [&>*]:min-w-0">
      <input type="hidden" name="id" value={post.id} />
      <input type="hidden" name="style" value={flyer.style} />
      <input type="hidden" name="image" value={flyer.image ?? ""} />

      {/* Left: flyer + designs + photo -------------------------------------- */}
      <div className="space-y-4">
        <FlyerCanvas flyer={flyer} brand={look} imageUrl={preview} fileName={post.topic.replace(/[^\w-]+/g, "-").slice(0, 40) || "flyer"} />

        <div className="rounded-2xl border border-slate-200 bg-surface p-4">
          <b className="text-[0.92rem] text-slate-900">Design</b>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {FLYER_STYLES.map((s) => (
              <button key={s.key} type="button" onClick={() => setFlyer((f) => ({ ...f, style: s.key }))} aria-pressed={flyer.style === s.key}
                className={cn("group rounded-xl p-1 text-center transition", flyer.style === s.key ? "bg-slate-900/5 ring-2 ring-[#111113]" : "hover:bg-slate-50")}>
                <span className="block transition duration-300 group-hover:-translate-y-0.5"><StyleThumb style={s.key} primary={brand.colors.primary} accent={brand.colors.accent} /></span>
                <span className="mt-1 block text-[0.68rem] text-slate-600">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <b className="block text-[0.92rem] text-slate-900">Your photo</b>
              <span className="text-[0.78rem] text-slate-500">A product, your shop, or your own finished flyer.</span>
            </div>
            {preview && <img src={preview} alt="" className="h-12 w-12 rounded-lg object-cover ring-1 ring-slate-200" />}
          </div>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => addPhoto(e.target.files?.[0])} />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="btn-secondary flex-1">
              <Icon name="paperclip" className="h-4 w-4" />
              {uploading ? "Uploading…" : preview ? "Change photo" : "Add photo"}
            </button>
            {preview && (
              <button type="button" className="btn-secondary" onClick={() => { setPreview(null); setFlyer((f) => ({ ...f, image: undefined, style: FLYER_STYLES.find((s) => s.key === f.style)?.photo ? "bold" : f.style })); }}>
                Remove
              </button>
            )}
          </div>
          {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
        </div>
      </div>

      {/* Right: text, time, captions ----------------------------------------------- */}
      <div className="space-y-4">
        <div className={cn("rounded-2xl border border-slate-200 bg-surface p-4", textDisabled && "opacity-50")}>
          <b className="text-[0.92rem] text-slate-900">Flyer text</b>
          {textDisabled && <span className="ml-2 text-[0.78rem] text-slate-500">Your own design is used as it is.</span>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(["headline", "subline", "cta"] as const).map((k) => (
              <div key={k} className={k === "subline" ? "sm:col-span-2" : ""}>
                <label className="label" htmlFor={k}>{k === "cta" ? "Button" : k === "headline" ? "Headline" : "Second line"}</label>
                <input className="input" id={k} name={k} value={flyer[k] ?? ""} disabled={textDisabled} maxLength={k === "subline" ? 110 : k === "cta" ? 30 : 60}
                  onChange={(e) => setFlyer((f) => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-surface p-4">
          <div>
            <label className="label" htmlFor="planned_for">Post on (Lagos time)</label>
            <input className="input" type="datetime-local" id="planned_for" name="planned_for" defaultValue={toLagosInput(post.planned_for)} />
          </div>
          {tags && (
            <div className="min-w-0 flex-1">
              <span className="label">Hashtags</span>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm text-slate-700">{tags}</p>
                <CopyButton text={tags} />
              </div>
            </div>
          )}
        </div>

        {platforms.map((p) => (
          <div key={p.key} className="rounded-2xl border border-slate-200 bg-surface p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="font-semibold text-slate-900" htmlFor={`caption_${p.key}`}>{p.label}</label>
              <CopyButton text={(captions[p.key] ?? "") + (p.key === "instagram" && tags ? `\n\n${tags}` : "")} />
            </div>
            <textarea id={`caption_${p.key}`} name={`caption_${p.key}`} className="input min-h-32" maxLength={2200} value={captions[p.key] ?? ""}
              onChange={(e) => setCaptions((c) => ({ ...c, [p.key]: e.target.value }))} placeholder={`No ${p.label} caption yet`} />
          </div>
        ))}

        {/* Hidden copies so disabled flyer inputs still save their text */}
        {textDisabled && (["headline", "subline", "cta"] as const).map((k) => <input key={k} type="hidden" name={k} value={flyer[k] ?? ""} />)}

        <div className="flex items-center gap-3">
          <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
          <FormMessage state={state} />
        </div>
      </div>
    </form>
  );
}
