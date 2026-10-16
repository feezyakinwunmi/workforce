"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icons";

/**
 * Picks a company logo, shrinks it in the browser (max 512 px, WebP, keeps transparency) and puts the
 * small file back into the form as "logo", so it uploads quickly on any connection.
 */
export function LogoPicker({ current, name, onRemove }: { current?: string | null; name: string; onRemove?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(current ?? null);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      setError("Use a PNG, JPG or WebP picture.");
      if (input.current) input.current.value = "";
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.9));
      if (!blob) throw new Error("no blob");
      const small = new File([blob], "logo.webp", { type: blob.type || "image/png" });
      const dt = new DataTransfer();
      dt.items.add(small);
      if (input.current) input.current.files = dt.files;
      setPreview(URL.createObjectURL(small));
    } catch {
      setError("We couldn't read that picture. Try another one.");
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Company logo" className="h-full w-full object-contain p-1" />
        ) : (
          <span className="font-display text-2xl font-bold text-slate-400">{name.trim().slice(0, 1).toUpperCase() || <Icon name="camera" />}</span>
        )}
      </span>
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <label className="btn-secondary btn-sm cursor-pointer">
            <Icon name="camera" className="h-4 w-4" />
            {preview ? "Change logo" : "Add logo"}
            <input ref={input} type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {preview && onRemove && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setPreview(null); if (input.current) input.current.value = ""; onRemove(); }}>
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">{error ? <span className="text-red-600">{error}</span> : "PNG, JPG or WebP. Square works best."}</p>
      </div>
    </div>
  );
}
