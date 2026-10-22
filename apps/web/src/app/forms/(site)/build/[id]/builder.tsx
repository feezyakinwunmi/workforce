"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { FormView } from "@/app/forms/form-view";
import {
  FIELD_TYPES,
  isChoice,
  isStatic,
  MAX_FIELDS,
  naira,
  newField,
  toKobo,
  uid,
  type Condition,
  type Field,
  type FieldType,
  type FormDef,
  type FormSettings,
  type Payment,
} from "@/lib/forms/schema";
import { cn } from "@/lib/utils";
import { saveForm } from "../../actions";

const TYPE_ICON: Record<FieldType, IconName> = {
  text: "pencil",
  textarea: "note",
  email: "mail",
  phone: "phone",
  number: "chart",
  date: "calendar",
  select: "chevronDown",
  radio: "check",
  checkbox: "tasks",
  rating: "sparkle",
  consent: "shield",
  heading: "layers",
  file: "paperclip",
  page: "arrowRight",
};

const COLORS = ["#6a4cf5", "#15123a", "#0f766e", "#0369a1", "#be123c", "#c2410c", "#a16207", "#4d7c0f"];

type Save = "saved" | "saving" | "unsaved" | "error";
const DRAG_TYPE = "application/x-workbase-field";

export function Builder({ id, initial, hasPayout, payoutsHref }: { id: string; initial: FormDef; hasPayout: boolean; payoutsHref: string }) {
  const [def, setDef] = useState<FormDef>(initial);
  const [selected, setSelected] = useState<string | null>(initial.fields[0]?.id ?? null);
  const [preview, setPreview] = useState(false);
  const [save, setSave] = useState<Save>("saved");
  const [saveError, setSaveError] = useState("");
  const [drop, setDrop] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);
  const first = useRef(true);

  // Autosave a moment after the last change.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSave("unsaved");
    const t = setTimeout(async () => {
      setSave("saving");
      const r = await saveForm(id, def).catch(() => ({ error: "Couldn't save. Check your connection." }));
      if (r.error) {
        setSave("error");
        setSaveError(r.error);
      } else setSave("saved");
    }, 700);
    return () => clearTimeout(t);
  }, [def, id]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save !== "saved") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  // A condition may only point at an earlier question: moving or deleting questions drops any that broke.
  const setFields = useCallback((fn: (f: Field[]) => Field[]) => setDef((d) => {
    const fields = fn(d.fields);
    return { ...d, fields: fields.map((f, i) => (f.when && !fields.slice(0, i).some((x) => x.id === f.when!.field && !isStatic(x.type)) ? { ...f, when: undefined } : f)) };
  }), []);
  const setSettings = useCallback((patch: Partial<FormSettings>) => setDef((d) => ({ ...d, settings: { ...d.settings, ...patch } })), []);
  const updateField = useCallback((fid: string, patch: Partial<Field>) => setFields((fs) => fs.map((f) => (f.id === fid ? { ...f, ...patch } : f))), [setFields]);

  function addField(type: FieldType, at?: number) {
    if (def.fields.length >= MAX_FIELDS) return;
    const f = newField(type);
    setFields((fs) => {
      const sel = fs.findIndex((x) => x.id === selected);
      const i = at ?? (sel >= 0 ? sel + 1 : fs.length);
      return [...fs.slice(0, i), f, ...fs.slice(i)];
    });
    setSelected(f.id);
    setTimeout(() => document.getElementById(`card-${f.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  function move(from: number, to: number) {
    setFields((fs) => {
      if (from < 0 || from >= fs.length) return fs;
      const next = [...fs];
      const [x] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(next.length, to > from ? to - 1 : to)), 0, x);
      return next;
    });
  }

  function onDragOverCard(e: React.DragEvent, i: number) {
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDrop(e.clientY < r.top + r.height / 2 ? i : i + 1);
  }

  function onDropAt(e: React.DragEvent) {
    e.preventDefault();
    const at = drop ?? def.fields.length;
    const type = e.dataTransfer.getData(DRAG_TYPE) as FieldType;
    if (type) addField(type, at);
    else if (dragFrom.current !== null) move(dragFrom.current, at);
    dragFrom.current = null;
    setDrop(null);
  }

  const payment = def.settings.payment;
  const hasEmail = def.fields.some((f) => f.type === "email");
  const choicePrices = def.fields.some((f) => f.options?.some((o) => (o.price ?? 0) > 0));

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <div className="sticky top-0 z-20 -mx-4 mb-5 flex items-center gap-3 border-b border-slate-200 bg-canvas/90 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="inline-flex rounded-lg border border-slate-300 bg-surface p-0.5 text-sm">
          {[["Edit", false], ["Preview", true]].map(([l, v]) => (
            <button key={l as string} type="button" onClick={() => setPreview(v as boolean)}
              className={cn("rounded-md px-3 py-1", preview === v ? "bg-brand-600 text-white" : "text-slate-600 hover:text-slate-900")}>
              {l}
            </button>
          ))}
        </div>
        <span className={cn("text-xs", save === "error" ? "text-red-600" : "text-slate-500")} role="status">
          {save === "saved" ? "All changes saved" : save === "saving" ? "Saving…" : save === "unsaved" ? "Unsaved changes" : saveError}
        </span>
      </div>

      {preview ? (
        <div className="mx-auto max-w-2xl">
          <FormView form={def} mode="preview" payments={hasPayout} />
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[13rem_minmax(0,1fr)_19rem]">
          {/* Question types: tap to add, or drag into place. */}
          <aside className="min-w-0 lg:sticky lg:top-16 lg:self-start">
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Add a question</p>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
              {FIELD_TYPES.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, t.type);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onDragEnd={() => setDrop(null)}
                  onClick={() => addField(t.type)}
                  title={t.hint}
                  className="flex shrink-0 cursor-grab items-center gap-2.5 rounded-xl border border-slate-200 bg-surface px-3 py-2 text-left text-sm text-slate-700 transition hover:border-brand-400 hover:text-slate-900 active:cursor-grabbing"
                >
                  <Icon name={TYPE_ICON[t.type]} className="h-4 w-4 text-brand-600 dark:text-brand-700" />
                  {t.label}
                </button>
              ))}
            </div>
          </aside>

          {/* The form itself. */}
          <section
            onDragOver={(e) => {
              e.preventDefault();
              if (e.target === e.currentTarget) setDrop(def.fields.length);
            }}
            onDrop={onDropAt}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null);
            }}
            className="min-w-0"
          >
            <div className="card p-5 sm:p-6" style={{ borderTop: `4px solid ${def.settings.color || "#6a4cf5"}` }}>
              <input
                aria-label="Form title"
                value={def.title}
                maxLength={120}
                onChange={(e) => setDef((d) => ({ ...d, title: e.target.value }))}
                className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 font-display text-2xl font-bold text-slate-900 hover:border-slate-200 focus:border-brand-500 focus:outline-none"
              />
              <textarea
                aria-label="Description"
                value={def.description}
                maxLength={2000}
                rows={2}
                placeholder="A short description (optional)"
                onChange={(e) => setDef((d) => ({ ...d, description: e.target.value }))}
                className="mt-1 w-full resize-y rounded-lg border border-transparent bg-transparent px-2 py-1 text-slate-600 placeholder:text-slate-400 hover:border-slate-200 focus:border-brand-500 focus:outline-none"
              />
            </div>

            <ol className="mt-3 space-y-3">
              {def.fields.map((f, i) => (
                <li key={f.id} id={`card-${f.id}`} onDragOver={(e) => onDragOverCard(e, i)}>
                  {drop === i && <DropLine />}
                  <FieldCard
                    field={f}
                    earlier={def.fields.slice(0, i).filter((x) => !isStatic(x.type))}
                    page={def.fields.slice(0, i + 1).filter((x) => x.type === "page").length + 1}
                    hasPages={def.fields.some((x) => x.type === "page")}
                    index={i}
                    count={def.fields.length}
                    open={selected === f.id}
                    priced={Boolean(payment?.enabled)}
                    onOpen={() => setSelected(selected === f.id ? null : f.id)}
                    onChange={(patch) => updateField(f.id, patch)}
                    onMove={(to) => move(i, to)}
                    onDragStart={() => (dragFrom.current = i)}
                    onDragEnd={() => {
                      dragFrom.current = null;
                      setDrop(null);
                    }}
                    onDuplicate={() => {
                      const copy = { ...structuredClone(f), id: uid(), options: f.options?.map((o) => ({ ...o, id: uid() })) };
                      setFields((fs) => [...fs.slice(0, i + 1), copy, ...fs.slice(i + 1)]);
                      setSelected(copy.id);
                    }}
                    onDelete={() => {
                      setFields((fs) => fs.filter((x) => x.id !== f.id));
                      setSelected(null);
                    }}
                  />
                  {drop === i + 1 && i === def.fields.length - 1 && <DropLine />}
                </li>
              ))}
            </ol>
            {def.fields.length === 0 && (
              <div className={cn("mt-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center text-sm text-slate-500", drop !== null ? "border-brand-400 bg-brand-50" : "border-slate-300")}>
                Tap a question type, or drag one here.
              </div>
            )}
            {def.fields.length >= MAX_FIELDS && <p className="mt-3 text-sm text-amber-700">That&apos;s the most questions one form can have ({MAX_FIELDS}).</p>}
          </section>

          {/* Settings */}
          <aside className="space-y-4 lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)] lg:self-start lg:overflow-y-auto">
            <Panel title="Payment" icon="cash">
              <Toggle
                label="Take payments with this form"
                on={Boolean(payment?.enabled)}
                onChange={(on) => setSettings({ payment: on ? { enabled: true, amount: payment?.amount ?? 0, custom: payment?.custom ?? false, min: payment?.min ?? 0, label: payment?.label ?? "" } : undefined })}
              />
              {payment?.enabled && (
                <PaymentSettings
                  payment={payment}
                  set={(p) => setSettings({ payment: { ...payment, ...p } })}
                  hasPayout={hasPayout}
                  payoutsHref={payoutsHref}
                  hasEmail={hasEmail}
                  choicePrices={choicePrices}
                  addEmail={() => {
                    const f = { ...newField("email"), label: "Email", required: true };
                    setFields((fs) => [f, ...fs]);
                    setSelected(f.id);
                  }}
                />
              )}
            </Panel>

            <Panel title="After sending" icon="send">
              <label className="label" htmlFor="s-submit">Button text</label>
              <input id="s-submit" className="input" maxLength={40} placeholder="Submit" value={def.settings.submit_label ?? ""} onChange={(e) => setSettings({ submit_label: e.target.value })} />
              <label className="label mt-3" htmlFor="s-msg">Thank-you message</label>
              <textarea id="s-msg" className="input" rows={2} maxLength={1000} placeholder="Thanks! Your answers were sent." value={def.settings.success_message ?? ""} onChange={(e) => setSettings({ success_message: e.target.value })} />
              <label className="label mt-3" htmlFor="s-url">Then go to a web page (optional)</label>
              <input id="s-url" className="input" type="url" maxLength={500} placeholder="https://…" value={def.settings.redirect_url ?? ""} onChange={(e) => setSettings({ redirect_url: e.target.value })} />
              {def.settings.redirect_url && !/^https:\/\//i.test(def.settings.redirect_url) && <p className="mt-1 text-xs text-amber-700">Use a full address starting with https://</p>}
            </Panel>

            <Panel title="Answers" icon="mail">
              <Toggle label="Email me each new answer" on={def.settings.notify !== false} onChange={(on) => setSettings({ notify: on })} />
              <div className="mt-3">
                <Toggle label="Let people change their answers later" on={Boolean(def.settings.allow_edit)} onChange={(on) => setSettings({ allow_edit: on || undefined })} />
                <p className="mt-1 text-xs text-slate-500">After sending, they get a private link to edit while the form is open.</p>
              </div>
              <label className="label mt-3" htmlFor="s-max">Stop after this many answers</label>
              <input id="s-max" className="input max-w-[10rem]" inputMode="numeric" placeholder="No limit"
                value={def.settings.max_responses ? String(def.settings.max_responses) : ""}
                onChange={(e) => setSettings({ max_responses: Number(e.target.value.replace(/\D/g, "")) || undefined })} />
            </Panel>

            <Panel title="Colour" icon="sparkle">
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={(def.settings.color || "#6a4cf5") === c} onClick={() => setSettings({ color: c })}
                    className={cn("h-8 w-8 rounded-full ring-offset-2 ring-offset-surface transition", (def.settings.color || "#6a4cf5") === c && "ring-2 ring-slate-900")}
                    style={{ background: c }} />
                ))}
              </div>
            </Panel>
          </aside>
        </div>
      )}
    </div>
  );
}

function DropLine() {
  return <div className="mb-3 h-1 rounded-full bg-brand-500" />;
}

function Panel({ title, icon, children }: { title: string; icon: IconName; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Icon name={icon} className="h-4 w-4 text-brand-600 dark:text-brand-700" />
        {title}
      </p>
      {children}
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-700">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-brand-600" : "bg-slate-300")}>
        <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition", on && "translate-x-5")} />
      </button>
    </label>
  );
}

/** A naira amount box that keeps what the person types until they leave the box. */
function MoneyInput({ value, onChange, id, placeholder }: { value: number; onChange: (kobo: number) => void; id?: string; placeholder?: string }) {
  const [text, setText] = useState(value ? String(value / 100) : "");
  useEffect(() => {
    if (toKobo(text) !== value) setText(value ? String(value / 100) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-500">₦</span>
      <input id={id} className="input pl-7" inputMode="decimal" placeholder={placeholder ?? "0"} value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(toKobo(e.target.value));
        }} />
    </div>
  );
}

function PaymentSettings({ payment, set, hasPayout, payoutsHref, hasEmail, choicePrices, addEmail }: {
  payment: Payment; set: (p: Partial<Payment>) => void; hasPayout: boolean; payoutsHref: string; hasEmail: boolean; choicePrices: boolean; addEmail: () => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      {!hasPayout && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Add the bank account the money should go to. <Link href={payoutsHref} className="font-medium underline">Set up payouts</Link>
        </p>
      )}
      {!hasEmail && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Payments need an email question for the receipt.{" "}
          <button type="button" onClick={addEmail} className="font-medium underline">Add one</button>
        </p>
      )}
      <div>
        <label className="label" htmlFor="p-label">What is it for?</label>
        <input id="p-label" className="input" maxLength={80} placeholder="Ticket, registration fee…" value={payment.label} onChange={(e) => set({ label: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="p-amount">Everyone pays</label>
        <MoneyInput id="p-amount" value={payment.amount} onChange={(amount) => set({ amount })} />
        <p className="mt-1 text-xs text-slate-500">Leave at 0 if the price comes from the options people pick (set prices on a choice question).</p>
      </div>
      <Toggle label="Let people type an amount" on={payment.custom} onChange={(custom) => set({ custom })} />
      {payment.custom && (
        <div>
          <label className="label" htmlFor="p-min">Smallest amount</label>
          <MoneyInput id="p-min" value={payment.min} onChange={(min) => set({ min })} placeholder="100" />
        </div>
      )}
      {!payment.amount && !payment.custom && !choicePrices && (
        <p className="text-xs text-amber-700">Nothing costs money yet: set an amount, prices on options, or let people type an amount.</p>
      )}
      <p className="text-xs text-slate-500">Paystack: card, bank transfer, USSD. We keep 3%; the rest goes to your bank. Minimum {naira(10000)}.</p>
    </div>
  );
}

function FieldCard({ field: f, earlier, page, hasPages, index, count, open, priced, onOpen, onChange, onMove, onDragStart, onDragEnd, onDuplicate, onDelete }: {
  field: Field; earlier: Field[]; page: number; hasPages: boolean; index: number; count: number; open: boolean; priced: boolean;
  onOpen: () => void; onChange: (p: Partial<Field>) => void; onMove: (to: number) => void;
  onDragStart: () => void; onDragEnd: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const typeLabel = FIELD_TYPES.find((t) => t.type === f.type)?.label ?? f.type;
  const labelRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) labelRef.current?.focus({ preventScroll: true });
  }, [open]);
  const swap = useMemo<FieldType[]>(
    () => (isChoice(f.type) ? ["radio", "select", "checkbox"] : f.type === "text" || f.type === "textarea" ? ["text", "textarea"] : []),
    [f.type],
  );

  return (
    <div className={cn("card transition", f.type === "page" && "border-dashed bg-slate-50", open ? "border-brand-400 shadow-md shadow-brand-900/5" : "hover:border-slate-300")}>
      <div className="flex items-start gap-2 p-3 sm:p-4">
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", f.id);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          title="Drag to move"
          className="mt-0.5 hidden cursor-grab touch-none rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing sm:block"
        >
          <Icon name="dots" className="h-4 w-4 rotate-90" />
        </span>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2 text-xs text-slate-500">
            <Icon name={TYPE_ICON[f.type]} className="h-3.5 w-3.5" />
            {f.type === "page" ? `Page ${page} starts here` : typeLabel}
            {f.required && <span className="badge bg-red-50 text-red-700">Required</span>}
            {f.when && <span className="badge bg-sky-50 text-sky-700">Only if…</span>}
            {hasPages && index === 0 && f.type !== "page" && <span className="text-slate-400">· Page 1</span>}
          </span>
          <span className={cn("mt-1 block truncate font-medium text-slate-900", isStatic(f.type) && "font-display text-lg")}>{f.label}</span>
          {!open && isChoice(f.type) && (
            <span className="mt-1 block truncate text-sm text-slate-500">
              {f.options?.map((o) => (priced && o.price ? `${o.label} (${naira(o.price)})` : o.label)).join(" · ")}
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center">
          <IconBtn icon="chevronDown" label="Move up" className="rotate-180" disabled={index === 0} onClick={() => onMove(index - 1)} />
          <IconBtn icon="chevronDown" label="Move down" disabled={index === count - 1} onClick={() => onMove(index + 2)} />
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-slate-200 p-3 sm:p-4">
          <div>
            <label className="label" htmlFor={`l-${f.id}`}>{f.type === "heading" ? "Title" : f.type === "page" ? "Page title" : f.type === "consent" ? "What they agree to" : "Question"}</label>
            <input ref={labelRef} id={`l-${f.id}`} className="input" maxLength={300} value={f.label} onChange={(e) => onChange({ label: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor={`h-${f.id}`}>{isStatic(f.type) ? "Text under the title (optional)" : "Help text (optional)"}</label>
            <input id={`h-${f.id}`} className="input" maxLength={500} value={f.help ?? ""} onChange={(e) => onChange({ help: e.target.value || undefined })} />
          </div>
          {["text", "textarea", "email", "phone", "number"].includes(f.type) && (
            <div>
              <label className="label" htmlFor={`p-${f.id}`}>Placeholder (optional)</label>
              <input id={`p-${f.id}`} className="input" maxLength={120} value={f.placeholder ?? ""} onChange={(e) => onChange({ placeholder: e.target.value || undefined })} />
            </div>
          )}
          {f.type === "number" && (
            <div className="grid grid-cols-2 gap-3">
              {(["min", "max"] as const).map((k) => (
                <div key={k}>
                  <label className="label" htmlFor={`${k}-${f.id}`}>{k === "min" ? "Smallest" : "Largest"}</label>
                  <input id={`${k}-${f.id}`} className="input" inputMode="decimal" value={f[k] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      onChange({ [k]: v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v) });
                    }} />
                </div>
              ))}
            </div>
          )}
          {isChoice(f.type) && <OptionsEditor field={f} priced={priced} onChange={onChange} />}
          {f.type === "file" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600">Accept</span>
              {([["any", "Any file"], ["image", "Photos only"], ["document", "Documents only"]] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => onChange({ accept: v })}
                  className={cn("rounded-full border px-3 py-1 text-xs", (f.accept ?? "any") === v ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-600 hover:border-slate-400")}>
                  {l}
                </button>
              ))}
              <span className="text-xs text-slate-500">Up to 10 MB each.</span>
            </div>
          )}
          <ConditionEditor field={f} earlier={earlier} onChange={(when) => onChange({ when })} />
          {swap.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600">Show as</span>
              {swap.map((t) => (
                <button key={t} type="button" onClick={() => onChange({ type: t })}
                  className={cn("rounded-full border px-3 py-1 text-xs", f.type === t ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-600 hover:border-slate-400")}>
                  {FIELD_TYPES.find((x) => x.type === t)?.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {!isStatic(f.type) ? (
              <Toggle label="Required" on={Boolean(f.required)} onChange={(required) => onChange({ required: required || undefined })} />
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={onDuplicate}><Icon name="copy" className="h-4 w-4" /> Duplicate</button>
              <button type="button" className="btn-secondary btn-sm text-red-600" onClick={onDelete}><Icon name="trash" className="h-4 w-4" /> Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({ icon, label, onClick, disabled, className }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent">
      <Icon name={icon} className={cn("h-4 w-4", className)} />
    </button>
  );
}

function OptionsEditor({ field: f, priced, onChange }: { field: Field; priced: boolean; onChange: (p: Partial<Field>) => void }) {
  const options = f.options ?? [];
  const set = (opts: typeof options) => onChange({ options: opts });
  const [bulk, setBulk] = useState<string | null>(null);
  return (
    <div>
      <p className="label">Options{priced && <span className="font-normal text-slate-500"> and prices</span>}</p>
      <ul className="space-y-2">
        {options.map((o, i) => (
          <li key={o.id} className="flex items-center gap-2">
            <span className={cn("h-4 w-4 shrink-0 border-2 border-slate-300", f.type === "checkbox" ? "rounded" : "rounded-full")} />
            <input aria-label={`Option ${i + 1}`} className="input" maxLength={200} value={o.label}
              onChange={(e) => set(options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const n = { id: uid(), label: "" };
                  set([...options.slice(0, i + 1), n, ...options.slice(i + 1)]);
                  setTimeout(() => (document.querySelector(`[aria-label="Option ${i + 2}"]`) as HTMLInputElement | null)?.focus(), 30);
                }
              }} />
            {priced && (
              <div className="w-32 shrink-0">
                <MoneyInput value={o.price ?? 0} onChange={(price) => set(options.map((x) => (x.id === o.id ? { ...x, price: price || undefined } : x)))} />
              </div>
            )}
            <IconBtn icon="x" label="Remove option" disabled={options.length <= 1} onClick={() => set(options.filter((x) => x.id !== o.id))} />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary btn-sm" disabled={options.length >= 50} onClick={() => set([...options, { id: uid(), label: `Option ${options.length + 1}` }])}>
          <Icon name="plus" className="h-4 w-4" /> Add option
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setBulk(bulk === null ? options.map((o) => o.label).join("\n") : null)}>
          {bulk === null ? "Paste a list" : "Cancel"}
        </button>
      </div>
      {bulk !== null && (
        <div className="mt-2">
          <textarea className="input" rows={5} value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label="One option per line" placeholder="One option per line" />
          <button type="button" className="btn-primary btn-sm mt-2"
            onClick={() => {
              const labels = [...new Set(bulk.split("\n").map((l) => l.trim()).filter(Boolean))].slice(0, 50);
              if (labels.length) set(labels.map((label) => ({ id: uid(), label, price: options.find((o) => o.label === label)?.price })));
              setBulk(null);
            }}>
            Use this list
          </button>
        </div>
      )}
    </div>
  );
}

const OPS: Array<[Condition["op"], string]> = [["is", "is"], ["not", "is not"], ["filled", "is answered"], ["empty", "is not answered"]];

/** "Show only if <earlier question> <is> <value>". A condition on a page break hides the whole page. */
function ConditionEditor({ field: f, earlier, onChange }: { field: Field; earlier: Field[]; onChange: (w: Condition | undefined) => void }) {
  const w = f.when;
  const src = earlier.find((x) => x.id === w?.field);
  if (!earlier.length) return null;
  if (!w) {
    return (
      <button type="button" className="btn-secondary btn-sm" onClick={() => {
        const first = [...earlier].reverse().find((x) => isChoice(x.type)) ?? earlier[earlier.length - 1];
        onChange({ field: first.id, op: isChoice(first.type) ? "is" : "filled", value: first.options?.[0]?.label });
      }}>
        <Icon name="eye" className="h-4 w-4" /> {f.type === "page" ? "Show this page only if…" : "Show only if…"}
      </button>
    );
  }
  const needsValue = w.op === "is" || w.op === "not";
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
      <p className="mb-2 text-sm font-medium text-slate-800">{f.type === "page" ? "Show this page only if" : "Show this question only if"}</p>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <select aria-label="Question" className="input" value={w.field} onChange={(e) => {
          const nf = earlier.find((x) => x.id === e.target.value)!;
          onChange({ field: nf.id, op: isChoice(nf.type) ? "is" : "filled", value: nf.options?.[0]?.label });
        }}>
          {earlier.map((x) => <option key={x.id} value={x.id}>{x.label.slice(0, 60)}</option>)}
        </select>
        <select aria-label="Condition" className="input" value={w.op} onChange={(e) => onChange({ ...w, op: e.target.value as Condition["op"] })}>
          {OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {needsValue && (src && isChoice(src.type) ? (
          <select aria-label="Answer" className="input" value={w.value ?? ""} onChange={(e) => onChange({ ...w, value: e.target.value })}>
            {src.options?.map((o) => <option key={o.id} value={o.label}>{o.label}</option>)}
          </select>
        ) : (
          <input aria-label="Answer" className="input" maxLength={200} placeholder="Answer" value={w.value ?? ""} onChange={(e) => onChange({ ...w, value: e.target.value })} />
        ))}
      </div>
      <button type="button" className="mt-2 text-xs font-medium text-slate-500 hover:text-red-600" onClick={() => onChange(undefined)}>Always show</button>
    </div>
  );
}
