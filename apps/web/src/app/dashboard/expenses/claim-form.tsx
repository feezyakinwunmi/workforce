"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { storageName, fileSize } from "@/lib/chat";
import { CATEGORIES, CATEGORY, RECEIPT_ACCEPT, RECEIPT_BUCKET, RECEIPT_MAX_BYTES, RECEIPT_TYPES } from "@/lib/expenses";
import { createClient } from "@/lib/supabase/client";

/** Phone photos are often 3–8 MB: shrink them to at most 2000 px as JPEG before upload (saves data). */
async function shrink(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 700_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function ClaimForm({ orgId, userId, today }: { orgId: string; userId: string; today: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function pick(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (!RECEIPT_TYPES.includes(f.type) && !/\.(heic|heif)$/i.test(f.name)) return setError("Use a photo or a PDF of the receipt.");
    if (f.size > RECEIPT_MAX_BYTES * 3) return setError("That file is too big (10 MB at most).");
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f.type.startsWith("image/") && f.type !== "image/heic" ? URL.createObjectURL(f) : null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(false);
    const fd = new FormData(e.currentTarget);
    const amount = Number(String(fd.get("amount") ?? "").replace(/[,\s₦$]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) return setError("Enter the amount, e.g. 4500.");
    const supabase = createClient();
    let receipt: { path: string; name: string } | null = null;
    try {
      if (file) {
        setBusy("Uploading the receipt…");
        const small = await shrink(file);
        if (small.size > RECEIPT_MAX_BYTES) throw new Error("The receipt is too big (10 MB at most).");
        const path = `${orgId}/${userId}/${crypto.randomUUID()}/${storageName(small.name)}`;
        const { error: upErr } = await supabase.storage
          .from(RECEIPT_BUCKET)
          .upload(path, small, { contentType: small.type || "image/heic", upsert: false });
        if (upErr) throw new Error(`Receipt not uploaded: ${upErr.message}`);
        receipt = { path, name: file.name };
      }
      setBusy("Sending…");
      const { error: err } = await supabase.from("expense_claims").insert({
        title: String(fd.get("title") ?? "").trim(),
        category: String(fd.get("category") ?? "other"),
        amount_minor: Math.round(amount * 100),
        currency: fd.get("currency") === "USD" ? "USD" : "NGN",
        spent_on: String(fd.get("spent_on") ?? today),
        note: String(fd.get("note") ?? "").trim() || null,
        receipt,
      });
      if (err) {
        if (receipt) await supabase.storage.from(RECEIPT_BUCKET).remove([receipt.path]);
        throw new Error(err.message);
      }
      formRef.current?.reset();
      setFile(null);
      setPreview(null);
      setDone(true);
      router.refresh();
    } catch (x) {
      setError(x instanceof Error ? x.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-4">
      <label className="flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed border-slate-300 p-4 transition hover:border-brand-400 hover:bg-brand-50/40">
        <input type="file" accept={RECEIPT_ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
            <Icon name={file ? "receipt" : "camera"} className="h-6 w-6" />
          </span>
        )}
        <span className="min-w-0 text-sm">
          <span className="block font-medium text-slate-900">{file ? file.name : "Photo of the receipt"}</span>
          <span className="block text-xs text-slate-500">{file ? `${fileSize(file.size)} · tap to change` : "Take a photo or choose a file (PDF works too)"}</span>
        </span>
      </label>

      <div>
        <label className="label" htmlFor="title">What was it for?</label>
        <input id="title" name="title" className="input" required minLength={2} maxLength={200} placeholder="Uber to the client's office" />
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <div>
          <label className="label" htmlFor="currency">Amount</label>
          <select id="currency" name="currency" className="input w-auto" defaultValue="NGN" aria-label="Currency">
            <option value="NGN">₦</option>
            <option value="USD">$</option>
          </select>
        </div>
        <div>
          <span className="label">&nbsp;</span>
          <input name="amount" inputMode="decimal" className="input" required placeholder="4500" aria-label="Amount" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="category">Category</label>
          <select id="category" name="category" className="input" defaultValue="transport">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY[c].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="spent_on">Date</label>
          <input id="spent_on" name="spent_on" type="date" className="input" defaultValue={today} max={today} required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="note">Note <span className="font-normal text-slate-400">(optional)</span></label>
        <textarea id="note" name="note" rows={2} maxLength={1000} className="input" />
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-red-600">
          <Icon name="alert" className="mt-0.5 h-4 w-4" />
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="flex items-center gap-2 text-sm text-emerald-700">
          <Icon name="check" className="h-4 w-4" />
          Sent for approval.
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={Boolean(busy)}>
        <Icon name="send" className="h-4 w-4" />
        {busy ?? "Send claim"}
      </button>
    </form>
  );
}
