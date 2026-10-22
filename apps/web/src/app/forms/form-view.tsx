"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Turnstile } from "@/components/turnstile";
import {
  acceptAttr,
  AMOUNT_KEY,
  checkAnswers,
  fileTypesFor,
  hasPrices,
  isStatic,
  MAX_FILE_BYTES,
  naira,
  pagesOf,
  safeFileName,
  visibleIds,
  type Field,
  type FileAnswer,
  type FormDef,
} from "@/lib/forms/schema";
import { cn } from "@/lib/utils";

export type SubmitResult = {
  error?: string;
  errors?: Record<string, string>;
  done?: { message: string; redirect?: string };
  pay?: { url: string; amount: number };
};

/** Uploads one file for a question; returns what to store as the answer. */
export type Uploader = (fieldId: string, file: File) => Promise<{ file?: FileAnswer; error?: string }>;

type Props = {
  form: FormDef;
  mode: "live" | "preview";
  embed?: boolean;
  /** Can the maker take payments (payout account set)? */
  payments?: boolean;
  accepting?: boolean;
  pro?: boolean;
  homeUrl?: string;
  onSubmit?: (raw: Record<string, unknown>, captcha: string | null) => Promise<SubmitResult>;
  upload?: Uploader;
};

/** Read the answers out of the <form> (one key per question id). */
function readForm(el: HTMLFormElement, fields: Field[]) {
  const fd = new FormData(el);
  const raw: Record<string, unknown> = {};
  for (const f of fields) {
    if (isStatic(f.type)) continue;
    if (f.type === "checkbox") raw[f.id] = fd.getAll(f.id).map(String);
    else if (f.type === "consent") raw[f.id] = fd.get(f.id) === "on";
    else raw[f.id] = String(fd.get(f.id) ?? "");
  }
  if (fd.has(AMOUNT_KEY)) raw[AMOUNT_KEY] = String(fd.get(AMOUNT_KEY) ?? "");
  return raw;
}

// Tell the page around an embedded form how tall it is (forms-embed.js listens). Measures the
// form itself, not the page: the page is never shorter than the frame, so it could only grow.
function useEmbedHeight(on: boolean, root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!on || !el || window.parent === window) return;
    const send = () => window.parent.postMessage({ type: "workbase-form", height: el.getBoundingClientRect().bottom + window.scrollY + 8 }, "*");
    const ro = new ResizeObserver(send);
    ro.observe(el);
    send();
    return () => ro.disconnect();
  }, [on, root]);
}

export function FormView(props: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEmbedHeight(Boolean(props.embed), rootRef);
  return (
    <div ref={rootRef}>
      <FormBody {...props} />
    </div>
  );
}

function FormBody({ form, mode, embed = false, payments = true, accepting = true, pro = false, homeUrl, onSubmit, upload }: Props) {
  const ref = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState<Record<string, unknown>>({});
  const [done, setDone] = useState<SubmitResult["done"] | null>(null);
  const [pay, setPay] = useState<SubmitResult["pay"] | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [files, setFiles] = useState<Record<string, FileAnswer | "uploading" | null>>({});
  const [step, setStep] = useState(0);

  const priced = hasPrices(form);
  const accent = form.settings.color || "#6a4cf5";
  const payment = form.settings.payment;

  const shown = useMemo(() => visibleIds(form, raw), [form, raw]);
  const pages = useMemo(() => pagesOf(form), [form]);
  // Pages whose page break is hidden by its condition are skipped.
  const steps = useMemo(() => pages.map((p, i) => ({ ...p, i })).filter((p) => !p.page || shown.has(p.page.id)), [pages, shown]);
  const at = Math.min(step, steps.length - 1);
  const current = steps[at];
  const last = at === steps.length - 1;
  const total = useMemo(() => (priced ? checkAnswers(form, raw).amount : 0), [form, raw, priced]);
  const uploading = Object.values(files).includes("uploading");

  const refresh = useCallback(() => {
    if (ref.current) setRaw(readForm(ref.current, form.fields));
  }, [form.fields]);
  // Ratings and files live in hidden inputs: read the form again once they're on the page.
  useEffect(refresh, [refresh, ratings, files]);

  const pageOf = (id: string) => steps.findIndex((p) => p.fields.some((f) => f.id === id));

  const scrollUp = () => {
    if (embed) window.parent.postMessage({ type: "workbase-form", scroll: true }, "*");
    else ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /** Show these errors and move to the page of the first one. */
  function showErrors(errs: Record<string, string>) {
    setErrors(errs);
    const first = form.fields.find((f) => errs[f.id]);
    const p = first ? pageOf(first.id) : -1;
    if (p >= 0 && p !== at) setStep(p);
    setTimeout(() => {
      if (first) document.getElementById(`q-${first.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      else scrollUp();
    }, 50);
  }

  function next() {
    if (!ref.current || uploading) return;
    const now = readForm(ref.current, form.fields);
    const { errors: all } = checkAnswers(form, now);
    const here = new Set(current.fields.map((f) => f.id));
    const errs = Object.fromEntries(Object.entries(all).filter(([k]) => here.has(k)));
    if (Object.keys(errs).length) return showErrors(errs);
    setErrors({});
    setStep(at + 1);
    setTimeout(scrollUp, 30);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ref.current || busy) return;
    if (!last) return next();
    if (uploading) return setErrors({ _form: "Wait for the file to finish uploading." });
    const now = readForm(ref.current, form.fields);
    const local = checkAnswers(form, now);
    if (Object.keys(local.errors).length) return showErrors(local.errors);
    setErrors({});
    if (mode === "preview" || !onSubmit) {
      setDone({ message: "Everything checks out. On the live form, this is where the answers are sent." });
      return;
    }
    setBusy(true);
    try {
      const res = await onSubmit(now, captcha);
      setResetKey((k) => k + 1);
      if (res.errors || res.error) return showErrors({ ...(res.errors ?? {}), ...(res.error ? { _form: res.error } : {}) });
      if (res.pay) {
        if (embed) {
          setPay(res.pay);
          scrollUp();
        } else {
          window.location.assign(res.pay.url);
          return;
        }
      } else if (res.done) {
        setDone(res.done);
        scrollUp();
        if (res.done.redirect && !embed) setTimeout(() => window.location.assign(res.done!.redirect!), 1800);
      }
    } catch {
      setErrors({ _form: "Couldn't send. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function attach(f: Field, file: File | null) {
    setErrors(({ [f.id]: _, ...rest }) => rest);
    if (!file) {
      setFiles((x) => ({ ...x, [f.id]: null }));
      return;
    }
    if (file.size > MAX_FILE_BYTES) return setErrors((e) => ({ ...e, [f.id]: "Files can be up to 10 MB." }));
    if (!fileTypesFor(f.accept).includes(file.type)) return setErrors((e) => ({ ...e, [f.id]: "This kind of file isn't allowed here." }));
    if (mode === "preview" || !upload) {
      const zero = "00000000-0000-0000-0000-000000000000";
      setFiles((x) => ({ ...x, [f.id]: { path: `${zero}/${zero}/${safeFileName(file.name)}`, name: file.name, size: file.size, type: file.type } }));
      return;
    }
    setFiles((x) => ({ ...x, [f.id]: "uploading" }));
    const r = await upload(f.id, file).catch(() => ({ error: "Upload failed. Check your connection and try again." }) as { file?: FileAnswer; error?: string });
    if (r.error || !r.file) {
      setFiles((x) => ({ ...x, [f.id]: null }));
      setErrors((e) => ({ ...e, [f.id]: r.error ?? "Upload failed. Try again." }));
    } else setFiles((x) => ({ ...x, [f.id]: r.file! }));
  }

  const shell = cn("card overflow-hidden", embed ? "shadow-none" : "shadow-sm");

  if (done) {
    return (
      <div className={shell} style={{ borderTop: `4px solid ${accent}` }}>
        <div className="px-6 py-12 text-center sm:px-10">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-white" style={{ background: accent }}>
            <Icon name="check" className="h-7 w-7" />
          </span>
          <p className="mt-5 font-display text-2xl font-bold text-slate-900">{form.title}</p>
          <p className="mx-auto mt-2 max-w-md whitespace-pre-wrap text-slate-600">{done.message}</p>
          {done.redirect && (
            <a href={done.redirect} target={embed ? "_top" : undefined} className="mt-6 inline-flex font-medium underline underline-offset-4" style={{ color: accent }}>
              Continue
            </a>
          )}
          {mode === "preview" && (
            <button type="button" className="btn-secondary btn-sm mt-6" onClick={() => { setDone(null); setStep(0); }}>
              Back to the form
            </button>
          )}
        </div>
        {!pro && <Badge homeUrl={homeUrl} embed={embed} />}
      </div>
    );
  }

  if (pay) {
    return (
      <div className={shell} style={{ borderTop: `4px solid ${accent}` }}>
        <div className="px-6 py-12 text-center sm:px-10">
          <p className="font-display text-2xl font-bold text-slate-900">One last step</p>
          <p className="mx-auto mt-2 max-w-md text-slate-600">Your answers are saved. Pay {naira(pay.amount)} securely with Paystack to finish.</p>
          <a href={pay.url} target="_blank" rel="noopener" className="btn-primary mt-6 px-6 py-3 text-base" style={{ background: accent }}>
            Pay {naira(pay.amount)}
          </a>
          <p className="mt-3 text-xs text-slate-500">Payment opens in a new tab.</p>
        </div>
      </div>
    );
  }

  return (
    <form ref={ref} onSubmit={submit} onChange={(e) => {
      refresh();
      const name = (e.target as unknown as HTMLInputElement).name;
      if (name && errors[name]) setErrors(({ [name]: _, ...rest }) => rest);
    }} noValidate className={shell} style={{ borderTop: `4px solid ${accent}` }}>
      <div className="px-5 pt-7 pb-2 sm:px-8">
        <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">{form.title}</h1>
        {form.description && at === 0 && <p className="mt-2 whitespace-pre-wrap text-slate-600">{form.description}</p>}
        {steps.length > 1 && (
          <div className="mt-4" aria-label={`Step ${at + 1} of ${steps.length}`}>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Step {at + 1} of {steps.length}</span>
              {current.page && <span className="truncate pl-3 font-medium text-slate-700">{current.page.label}</span>}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full transition-all" style={{ width: `${((at + 1) / steps.length) * 100}%`, background: accent }} />
            </div>
          </div>
        )}
      </div>

      {!accepting && (
        <div className="mx-5 mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:mx-8">This form isn&apos;t taking answers any more.</div>
      )}
      {mode === "live" && priced && !payments && (
        <div className="mx-5 mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:mx-8">
          This form can&apos;t take payments yet. Please contact its owner.
        </div>
      )}

      <fieldset disabled={!accepting || busy} className="space-y-6 px-5 py-6 sm:px-8">
        {current.page && (current.page.help || at > 0) && (
          <div className="border-b border-slate-200 pb-3">
            <h2 className="font-display text-xl font-bold text-slate-900">{current.page.label}</h2>
            {current.page.help && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{current.page.help}</p>}
          </div>
        )}
        {/* Every question stays in the form (so its answer is kept); only this page's showing ones are visible. */}
        {pages.map((p, pi) =>
          p.fields.map((f) => (
            <div key={f.id} hidden={pi !== current.i || !shown.has(f.id)}>
              <Question field={f} error={errors[f.id]} priced={Boolean(payment?.enabled)} accent={accent}
                rating={ratings[f.id] ?? 0}
                onRate={(v) => {
                  setRatings((r) => ({ ...r, [f.id]: v }));
                  setErrors(({ [f.id]: _, ...rest }) => rest);
                }}
                file={files[f.id] ?? null}
                onFile={(file) => attach(f, file)}
              />
            </div>
          )),
        )}

        {last && payment?.enabled && payment.custom && (
          <div id={`q-${AMOUNT_KEY}`}>
            <label className="label" htmlFor={AMOUNT_KEY}>
              {payment.label ? `${payment.label} amount` : "Amount"} (₦)
              {payment.amount === 0 && <span className="text-red-600"> *</span>}
            </label>
            <input id={AMOUNT_KEY} name={AMOUNT_KEY} inputMode="decimal" className="input max-w-xs" placeholder={payment.min ? `At least ${naira(payment.min)}` : "e.g. 5,000"} />
            {errors[AMOUNT_KEY] && <p className="mt-1.5 text-sm text-red-600">{errors[AMOUNT_KEY]}</p>}
          </div>
        )}
      </fieldset>

      <div className="border-t border-slate-200 px-5 py-5 sm:px-8">
        {errors._form && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errors._form}</p>}
        {Object.keys(errors).some((k) => k !== "_form") && !errors._form && (
          <p className="mb-3 text-sm text-red-600">Please check the answers marked in red.</p>
        )}
        {mode === "live" && last && <Turnstile resetKey={resetKey} onToken={setCaptcha} className="mb-3" />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {at > 0 ? (
            <button type="button" className="btn-secondary px-4 py-2.5" onClick={() => { setErrors({}); setStep(at - 1); setTimeout(scrollUp, 30); }}>
              <Icon name="arrowLeft" className="h-4 w-4" /> Back
            </button>
          ) : priced && last ? (
            <p className="text-sm text-slate-600">
              {payment?.label || "Total"}: <span className="font-display text-xl font-bold text-slate-900">{naira(total)}</span>
            </p>
          ) : (
            <span />
          )}
          {at > 0 && priced && last && (
            <p className="text-sm text-slate-600">
              {payment?.label || "Total"}: <span className="font-display text-xl font-bold text-slate-900">{naira(total)}</span>
            </p>
          )}
          <button type="submit" className="btn-primary px-6 py-2.5 text-base" style={{ background: accent }} disabled={!accepting || busy || uploading}>
            {busy ? "Sending…" : uploading ? "Uploading…" : !last ? <>Next <Icon name="arrowRight" className="h-4 w-4" /></>
              : form.settings.submit_label || (priced && total > 0 ? "Continue to payment" : "Submit")}
          </button>
        </div>
        {priced && last && total > 0 && <p className="mt-2 text-xs text-slate-500">Paid securely with Paystack: card, bank transfer or USSD.</p>}
      </div>
      {!pro && <Badge homeUrl={homeUrl} embed={embed} />}
    </form>
  );
}

function Badge({ homeUrl, embed }: { homeUrl?: string; embed: boolean }) {
  return (
    <a href={homeUrl || "/forms"} target={embed ? "_blank" : undefined} rel="noopener"
      className="block border-t border-slate-100 bg-slate-50 px-5 py-2.5 text-center text-xs text-slate-500 hover:text-slate-800">
      Made with <span className="font-semibold">Workbase Forms</span>. Make your own free.
    </a>
  );
}

const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function Question({ field: f, error, priced, accent, rating, onRate, file, onFile }: {
  field: Field; error?: string; priced: boolean; accent: string; rating: number; onRate: (v: number) => void;
  file: FileAnswer | "uploading" | null; onFile: (f: File | null) => void;
}) {
  const pick = useRef<HTMLInputElement>(null);
  if (f.type === "heading") {
    return (
      <div className="border-b border-slate-200 pt-2 pb-2">
        <h2 className="font-display text-lg font-bold text-slate-900">{f.label}</h2>
        {f.help && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{f.help}</p>}
      </div>
    );
  }
  const id = `q-${f.id}`;
  const req = f.required ? <span className="text-red-600"> *</span> : null;
  const help = f.help ? <p className="mb-2 -mt-0.5 text-sm text-slate-500">{f.help}</p> : null;
  const err = error ? <p className="mt-1.5 text-sm text-red-600">{error}</p> : null;
  const bad = error ? "border-red-400" : "";
  const price = (p?: number) => (priced && p ? <span className="ml-auto pl-3 text-sm font-medium text-slate-500">+{naira(p)}</span> : null);

  if (f.type === "consent") {
    return (
      <div id={id}>
        <label className="flex items-start gap-3 text-sm text-slate-800">
          <input type="checkbox" name={f.id} className="mt-0.5 h-5 w-5 shrink-0 rounded" style={{ accentColor: accent }} />
          <span>{f.label}{req}</span>
        </label>
        {f.help && <p className="mt-1 ml-8 text-sm text-slate-500">{f.help}</p>}
        {err}
      </div>
    );
  }

  if (f.type === "file") {
    const ready = file && file !== "uploading" ? file : null;
    return (
      <div id={id}>
        <p className="label">{f.label}{req}</p>
        {help}
        <input type="hidden" name={f.id} value={ready ? JSON.stringify(ready) : ""} />
        <input ref={pick} type="file" className="sr-only" accept={acceptAttr(f.accept)} aria-label={f.label} tabIndex={-1}
          onChange={(e) => {
            onFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }} />
        {ready ? (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm">
            <Icon name="paperclip" className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="min-w-0 flex-1 truncate text-slate-800">{ready.name}</span>
            <span className="shrink-0 text-xs text-slate-500">{size(ready.size)}</span>
            <button type="button" className="shrink-0 text-sm font-medium text-slate-500 hover:text-red-600" onClick={() => onFile(null)}>Remove</button>
          </div>
        ) : (
          <button type="button" disabled={file === "uploading"} onClick={() => pick.current?.click()}
            className={cn("flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-sm transition hover:bg-slate-50", error ? "border-red-300" : "border-slate-300")}>
            <Icon name={file === "uploading" ? "refresh" : "paperclip"} className={cn("h-5 w-5 text-slate-500", file === "uploading" && "animate-spin")} />
            <span className="font-medium text-slate-800">{file === "uploading" ? "Uploading…" : "Choose a file"}</span>
            <span className="text-xs text-slate-500">
              {f.accept === "image" ? "Photo" : f.accept === "document" ? "PDF, Word, Excel or text" : "Photo, PDF, Word, Excel or zip"} · up to 10 MB
            </span>
          </button>
        )}
        {err}
      </div>
    );
  }

  return (
    <div id={id}>
      {f.type === "radio" || f.type === "checkbox" || f.type === "rating" ? (
        <p className="label">{f.label}{req}</p>
      ) : (
        <label className="label" htmlFor={`in-${f.id}`}>{f.label}{req}</label>
      )}
      {help}
      {f.type === "textarea" ? (
        <textarea id={`in-${f.id}`} name={f.id} rows={4} className={cn("input", bad)} placeholder={f.placeholder} maxLength={5000} />
      ) : f.type === "select" ? (
        <select id={`in-${f.id}`} name={f.id} className={cn("input", bad)} defaultValue="">
          <option value="" disabled>Choose…</option>
          {f.options?.map((o) => (
            <option key={o.id} value={o.label}>{o.label}{priced && o.price ? ` (+${naira(o.price)})` : ""}</option>
          ))}
        </select>
      ) : f.type === "radio" || f.type === "checkbox" ? (
        <div className="space-y-2">
          {f.options?.map((o) => (
            <label key={o.id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm text-slate-800 transition hover:bg-slate-50", error ? "border-red-300" : "border-slate-200")}>
              <input type={f.type} name={f.id} value={o.label} className="h-4.5 w-4.5 shrink-0" style={{ accentColor: accent }} />
              <span>{o.label}</span>
              {price(o.price)}
            </label>
          ))}
        </div>
      ) : f.type === "rating" ? (
        <div className="flex gap-1">
          <input type="hidden" name={f.id} value={rating || ""} />
          {[1, 2, 3, 4, 5].map((v) => (
            <button key={v} type="button" aria-label={`${v} star${v > 1 ? "s" : ""}`} aria-pressed={rating === v} onClick={() => onRate(v)}
              className="rounded-lg p-1 text-3xl leading-none transition hover:scale-110" style={{ color: v <= rating ? "#f2a93b" : "#cbd5e1" }}>
              ★
            </button>
          ))}
        </div>
      ) : (
        <input
          id={`in-${f.id}`}
          name={f.id}
          type={f.type === "phone" ? "tel" : f.type === "number" ? "text" : f.type}
          inputMode={f.type === "number" ? "decimal" : undefined}
          autoComplete={f.type === "email" ? "email" : f.type === "phone" ? "tel" : undefined}
          className={cn("input", bad, f.type === "date" || f.type === "number" ? "max-w-xs" : "")}
          placeholder={f.placeholder}
          maxLength={f.type === "text" ? 500 : 200}
        />
      )}
      {err}
    </div>
  );
}

