"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icons";
import { storageName } from "@/lib/chat";
import { DOC_ACCEPT, DOC_KIND, DOC_MAX_BYTES, DOCS_BUCKET, EMPLOYMENT, NIGERIAN_BANKS, NIGERIAN_PFAS, type DocKind, type StaffProfile } from "@/lib/staff";
import { createClient } from "@/lib/supabase/client";
import { saveRecord } from "./actions";

function Field({ label, name, value, type = "text", list, placeholder, max, disabled, inputMode, span }: {
  label: string;
  name: string;
  value?: string | null;
  type?: string;
  list?: string;
  placeholder?: string;
  max?: number;
  disabled?: boolean;
  inputMode?: "numeric" | "tel" | "text";
  span?: boolean;
}) {
  return (
    <div className={span ? "sm:col-span-2" : undefined}>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} list={list} defaultValue={value ?? ""} placeholder={placeholder} maxLength={max}
             disabled={disabled} inputMode={inputMode} className="input" />
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-100 pt-5 first:border-0 first:pt-0">
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function RecordForm({ userId, profile: p, admin }: { userId: string; profile: StaffProfile | null; admin: boolean }) {
  const [state, action] = useActionState(saveRecord, undefined);
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="user_id" value={userId} />
      <Group title="Employment">
        <Field label="Start date" name="start_date" type="date" value={p?.start_date} disabled={!admin} />
        <div>
          <label className="label" htmlFor="employment_type">Type</label>
          <select id="employment_type" name="employment_type" className="input" defaultValue={p?.employment_type ?? ""} disabled={!admin}>
            <option value="">Not set</option>
            {Object.entries(EMPLOYMENT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </Group>
      {/* Disabled fields aren't submitted; keep the stored values for people who can't change them. */}
      {!admin && (
        <>
          <input type="hidden" name="start_date" value={p?.start_date ?? ""} />
          <input type="hidden" name="employment_type" value={p?.employment_type ?? ""} />
        </>
      )}
      <Group title="Contact">
        <Field label="Phone" name="phone" type="tel" inputMode="tel" value={p?.phone} placeholder="+234 801 234 5678" max={30} />
        <Field label="Date of birth" name="date_of_birth" type="date" value={p?.date_of_birth} />
        <Field label="Home address" name="address" value={p?.address} max={300} span />
      </Group>
      <Group title="Bank">
        <Field label="Bank" name="bank_name" list="banks" value={p?.bank_name} max={80} />
        <Field label="Account number" name="account_number" inputMode="numeric" value={p?.account_number} placeholder="10 digits" max={20} />
        <Field label="Account name" name="account_name" value={p?.account_name} max={120} span />
        <datalist id="banks">{NIGERIAN_BANKS.map((b) => <option key={b} value={b} />)}</datalist>
      </Group>
      <Group title="Pension and tax">
        <Field label="Pension fund administrator" name="pension_pfa" list="pfas" value={p?.pension_pfa} max={80} />
        <Field label="RSA PIN" name="pension_pin" value={p?.pension_pin} placeholder="PEN100…" max={20} />
        <Field label="Tax ID (TIN)" name="tax_id" value={p?.tax_id} max={20} />
        <datalist id="pfas">{NIGERIAN_PFAS.map((b) => <option key={b} value={b} />)}</datalist>
      </Group>
      <Group title="Emergency contact">
        <Field label="Name" name="emergency_name" value={p?.emergency_name} max={120} />
        <Field label="Relationship" name="emergency_relationship" value={p?.emergency_relationship} placeholder="Sister" max={60} />
        <Field label="Phone" name="emergency_phone" type="tel" inputMode="tel" value={p?.emergency_phone} max={30} />
      </Group>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Saving…">Save</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DocumentUpload({ orgId, userId }: { orgId: string; userId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<DocKind>("contract");
  const [title, setTitle] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    if (file.size > DOC_MAX_BYTES) return setError("That file is too big (10 MB at most).");
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const path = `${orgId}/${userId}/${crypto.randomUUID()}/${storageName(file.name)}`;
    const { error: upErr } = await supabase.storage.from(DOCS_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (upErr) {
      setBusy(false);
      return setError(`Not uploaded: ${upErr.message}`);
    }
    const { error: err } = await supabase.from("staff_documents").insert({
      user_id: userId,
      kind,
      title: title.trim() || DOC_KIND[kind],
      file: { path, name: file.name },
      expires_on: expires || null,
    });
    setBusy(false);
    if (err) {
      await supabase.storage.from(DOCS_BUCKET).remove([path]);
      return setError(err.message);
    }
    setFile(null);
    setTitle("");
    setExpires("");
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as DocKind)} aria-label="Kind of document">
          {Object.entries(DOC_KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "id" ? "NIN slip, passport…" : "Title (optional)"} maxLength={200} aria-label="Title" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="btn-secondary btn-sm cursor-pointer">
          <Icon name="paperclip" className="h-3.5 w-3.5" />
          {file ? file.name.slice(0, 32) : "Choose file"}
          <input ref={fileRef} type="file" accept={DOC_ACCEPT} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {kind === "id" && (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Expires
            <input type="date" className="input w-auto py-1 text-xs" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
        )}
        <button type="button" className="btn-primary btn-sm ml-auto" disabled={!file || busy} onClick={upload}>
          <Icon name="download" className="h-3.5 w-3.5 rotate-180" />
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
