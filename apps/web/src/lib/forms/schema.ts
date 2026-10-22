/**
 * Workbase Forms: the shape of a form and the rules for answers. Pure (no server or browser
 * imports), so the builder, the public page and the server all use the same code.
 *
 * Safety: the server ALWAYS re-checks answers and works out the amount to pay with
 * `checkAnswers()` before anything is stored (form_submit is service-role only), so a visitor can't
 * change prices or skip required questions by editing the page.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "select"
  | "radio"
  | "checkbox"
  | "consent"
  | "rating"
  | "file"
  | "heading"
  | "page";

export type Option = { id: string; label: string; /** kobo; only used when payments are on */ price?: number };

/** Show a question (or a whole page) only when an earlier answer matches. */
export type Condition = { field: string; op: "is" | "not" | "filled" | "empty"; value?: string };

/** What a file question takes. */
export type FileAccept = "any" | "image" | "document";

export type Field = {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  placeholder?: string;
  required?: boolean;
  options?: Option[];
  min?: number;
  max?: number;
  when?: Condition;
  accept?: FileAccept;
};

/** A file someone attached (stored in the private form-files bucket). */
export type FileAnswer = { path: string; name: string; size: number; type: string };

export type Payment = {
  enabled: boolean;
  /** Fixed part everyone pays (kobo, may be 0 when only options have prices). */
  amount: number;
  /** The person types an amount (donations, "pay what you want"). */
  custom: boolean;
  /** Smallest amount they can type (kobo). */
  min: number;
  /** What the payment is for ("Ticket", "Registration fee"). */
  label: string;
};

export type FormSettings = {
  submit_label?: string;
  success_message?: string;
  redirect_url?: string;
  max_responses?: number;
  /** Email the maker for each answer (default on). */
  notify?: boolean;
  /** People get a private link to change their answer while the form is open. */
  allow_edit?: boolean;
  color?: string;
  payment?: Payment;
};

export type FormDef = { title: string; description: string; fields: Field[]; settings: FormSettings };

export type PublicForm = FormDef & { id: string; slug: string; accepting: boolean; payments: boolean; pro: boolean };

export type Answer = string | string[] | number | boolean | FileAnswer;
export type Answers = Record<string, Answer>;

/** Key used for the "pay what you want" amount in the answers. */
export const AMOUNT_KEY = "__amount";

export const MIN_PAYMENT = 10000; // ₦100, Paystack's floor for us
export const MAX_FIELDS = 60;
export const MAX_FILE_FIELDS = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** File types people may upload, by what the question accepts. */
export const FILE_TYPES: Record<Exclude<FileAccept, "any">, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
  ],
};
export const ANY_FILE_TYPES = [...FILE_TYPES.image, ...FILE_TYPES.document, "application/zip"];
export const fileTypesFor = (accept?: FileAccept) => (accept === "image" ? FILE_TYPES.image : accept === "document" ? FILE_TYPES.document : ANY_FILE_TYPES);
/** For the <input accept> attribute (extensions help phones pick the right files). */
export const acceptAttr = (accept?: FileAccept) =>
  accept === "image" ? "image/*,.heic" : accept === "document" ? ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" : "image/*,.heic,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip";
/** A safe file name for storage paths. */
export const safeFileName = (name: string) =>
  (name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").replace(/^[.-]+/, "").slice(-80) || "file");

export const FIELD_TYPES: Array<{ type: FieldType; label: string; hint: string }> = [
  { type: "text", label: "Short answer", hint: "Name, company, one line" },
  { type: "textarea", label: "Long answer", hint: "Comments, a paragraph" },
  { type: "email", label: "Email", hint: "Checked to look like an email" },
  { type: "phone", label: "Phone", hint: "WhatsApp or mobile number" },
  { type: "number", label: "Number", hint: "Age, quantity, a score" },
  { type: "date", label: "Date", hint: "A calendar to pick a day" },
  { type: "select", label: "Dropdown", hint: "Pick one from a list" },
  { type: "radio", label: "Multiple choice", hint: "Pick one, all shown" },
  { type: "checkbox", label: "Checkboxes", hint: "Pick any number" },
  { type: "rating", label: "Rating", hint: "1 to 5 stars" },
  { type: "consent", label: "Agreement", hint: "A box they must tick" },
  { type: "file", label: "File upload", hint: "CV, receipt, photo (10 MB)" },
  { type: "heading", label: "Section title", hint: "Text between questions" },
  { type: "page", label: "New page", hint: "Split the form into steps" },
];

/** Types that hold no answer. */
export const isStatic = (t: FieldType) => t === "heading" || t === "page";

export const CHOICE_TYPES: FieldType[] = ["select", "radio", "checkbox"];
export const isChoice = (t: FieldType) => CHOICE_TYPES.includes(t);

export const uid = () => Math.random().toString(36).slice(2, 10);

export function newField(type: FieldType): Field {
  const label = FIELD_TYPES.find((t) => t.type === type)?.label ?? "Question";
  const f: Field = {
    id: uid(),
    type,
    label: type === "heading" ? "New section" : type === "consent" ? "I agree to the terms" : type === "page" ? "Next page" : type === "file" ? "Upload a file" : label,
  };
  if (isChoice(type)) f.options = [{ id: uid(), label: "Option 1" }, { id: uid(), label: "Option 2" }];
  if (type === "consent") f.required = true;
  return f;
}

export const naira = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** "₦5,000" / "5000" / "5,000.50" → kobo (0 when empty or not a number). */
export function toKobo(v: string | number | undefined | null) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[₦,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const kobo = (v: unknown) => Math.max(0, Math.min(1_000_000_000, Math.round(n(v) ?? 0)));
const safeId = (v: unknown) => (typeof v === "string" && /^[a-z0-9]{1,16}$/i.test(v) ? v : uid());

/** Clean a form from the builder before saving (drops anything unexpected, caps every size). */
export function sanitizeForm(raw: unknown): FormDef {
  const r = (raw ?? {}) as Record<string, unknown>;
  const ids = new Set<string>();
  const answerable = new Map<string, FieldType>(); // earlier questions a condition may point at
  let files = 0;
  const fields: Field[] = (Array.isArray(r.fields) ? r.fields : []).slice(0, MAX_FIELDS).flatMap((x) => {
    const f = (x ?? {}) as Record<string, unknown>;
    const type = FIELD_TYPES.find((t) => t.type === f.type)?.type;
    if (!type) return [];
    if (type === "file" && ++files > MAX_FILE_FIELDS) return [];
    let id = safeId(f.id);
    while (ids.has(id)) id = uid();
    ids.add(id);
    const out: Field = { id, type, label: s(f.label, 300).trim() || "Question" };
    const help = s(f.help, 500).trim();
    if (help) out.help = help;
    const placeholder = s(f.placeholder, 120).trim();
    if (placeholder && ["text", "textarea", "email", "phone", "number"].includes(type)) out.placeholder = placeholder;
    if (!isStatic(type) && f.required === true) out.required = true;
    const w = (f.when ?? null) as Record<string, unknown> | null;
    if (w && typeof w.field === "string" && answerable.has(w.field) && ["is", "not", "filled", "empty"].includes(w.op as string)) {
      const op = w.op as Condition["op"];
      const value = s(w.value, 200).trim();
      if (op === "filled" || op === "empty") out.when = { field: w.field, op };
      else if (value) out.when = { field: w.field, op, value };
    }
    if (type === "file") out.accept = f.accept === "image" || f.accept === "document" ? f.accept : "any";
    if (isChoice(type)) {
      const optIds = new Set<string>();
      out.options = (Array.isArray(f.options) ? f.options : []).slice(0, 50).flatMap((o) => {
        const op = (o ?? {}) as Record<string, unknown>;
        const label = s(op.label, 200).trim();
        if (!label) return [];
        let oid = safeId(op.id);
        while (optIds.has(oid)) oid = uid();
        optIds.add(oid);
        const price = kobo(op.price);
        return [price ? { id: oid, label, price } : { id: oid, label }];
      });
      if (!out.options.length) out.options = [{ id: uid(), label: "Option 1" }];
    }
    if (type === "number") {
      const min = n(f.min);
      const max = n(f.max);
      if (min !== undefined) out.min = min;
      if (max !== undefined) out.max = max;
    }
    if (!isStatic(type)) answerable.set(id, type);
    return [out];
  });
  const st = (r.settings ?? {}) as Record<string, unknown>;
  const p = (st.payment ?? {}) as Record<string, unknown>;
  const settings: FormSettings = {
    submit_label: s(st.submit_label, 40).trim() || undefined,
    success_message: s(st.success_message, 1000).trim() || undefined,
    redirect_url: /^https:\/\/[^\s]+$/i.test(s(st.redirect_url, 500).trim()) ? s(st.redirect_url, 500).trim() : undefined,
    max_responses: Math.max(0, Math.min(1_000_000, Math.round(n(st.max_responses) ?? 0))) || undefined,
    notify: st.notify === false ? false : true,
    allow_edit: st.allow_edit === true || undefined,
    color: /^#[0-9a-f]{6}$/i.test(s(st.color, 7)) ? s(st.color, 7) : undefined,
    payment: p.enabled
      ? { enabled: true, amount: kobo(p.amount), custom: p.custom === true, min: kobo(p.min), label: s(p.label, 80).trim() }
      : undefined,
  };
  return {
    title: s(r.title, 120).trim() || "Untitled form",
    description: s(r.description, 2000),
    fields,
    settings: JSON.parse(JSON.stringify(settings)) as FormSettings, // drops undefined keys
  };
}

/** What the person pays for these answers (kobo). Prices only count while payments are on. */
export function totalFor(def: Pick<FormDef, "fields" | "settings">, answers: Answers) {
  const pay = def.settings.payment;
  if (!pay?.enabled) return 0;
  let total = pay.amount;
  for (const f of def.fields) {
    if (!isChoice(f.type)) continue;
    const a = answers[f.id];
    const chosen = Array.isArray(a) ? a : typeof a === "string" ? [a] : [];
    for (const label of chosen) total += f.options?.find((o) => o.label === label)?.price ?? 0;
  }
  if (pay.custom) total += typeof answers[AMOUNT_KEY] === "number" ? (answers[AMOUNT_KEY] as number) : 0;
  return total;
}

/** Does any part of this form cost money? */
export const hasPrices = (def: Pick<FormDef, "fields" | "settings">) =>
  Boolean(def.settings.payment?.enabled && (def.settings.payment.amount > 0 || def.settings.payment.custom ||
    def.fields.some((f) => f.options?.some((o) => (o.price ?? 0) > 0))));

/** Is this raw answer (from the browser or stored) empty? */
function blank(v: unknown) {
  if (v === undefined || v === null || v === false || v === "false") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return !(v as FileAnswer).path;
  return String(v).trim() === "";
}

function matches(c: Condition, v: unknown) {
  if (c.op === "filled") return !blank(v);
  if (c.op === "empty") return blank(v);
  const want = (c.value ?? "").trim().toLowerCase();
  const got = Array.isArray(v) ? v.map((x) => String(x).trim().toLowerCase()) : blank(v) ? [] : [String(v).trim().toLowerCase()];
  const hit = got.includes(want);
  return c.op === "is" ? hit : !hit;
}

/**
 * Which fields are showing for these answers. A page break's condition hides the whole page;
 * a question whose condition points at a hidden question counts that one as unanswered.
 */
export function visibleIds(def: Pick<FormDef, "fields">, raw: Record<string, unknown>) {
  const shown = new Set<string>();
  let pageShown = true;
  for (const f of def.fields) {
    const ok = !f.when || matches(f.when, shown.has(f.when.field) ? raw[f.when.field] : undefined);
    if (f.type === "page") {
      pageShown = ok;
      if (ok) shown.add(f.id);
      continue;
    }
    if (pageShown && ok) shown.add(f.id);
  }
  return shown;
}

/** The form split at its page breaks: [{ page (the break, or null for the first), fields }]. */
export function pagesOf(def: Pick<FormDef, "fields">) {
  const pages: Array<{ page: Field | null; fields: Field[] }> = [{ page: null, fields: [] }];
  for (const f of def.fields) {
    if (f.type === "page") pages.push({ page: f, fields: [] });
    else pages[pages.length - 1].fields.push(f);
  }
  return pages.filter((p, i) => i === 0 || p.page);
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^[+0-9 ()-]{7,20}$/;

/**
 * Check raw answers (from the browser) against the form. Returns clean answers, the payer's email
 * (the first email question) and the amount, or errors by field id.
 */
export function checkAnswers(def: Pick<FormDef, "fields" | "settings">, raw: Record<string, unknown>, opts: { formId?: string } = {}) {
  const errors: Record<string, string> = {};
  const answers: Answers = {};
  const shown = visibleIds(def, raw);
  for (const f of def.fields) {
    if (isStatic(f.type) || !shown.has(f.id)) continue; // hidden questions keep no answer
    const v = f.type === "file" ? parseFile(raw[f.id]) : raw[f.id];
    if (f.type === "file") {
      if (!v) {
        if (f.required) errors[f.id] = "Please attach a file.";
        continue;
      }
      const file = v as FileAnswer;
      const prefix = opts.formId ? `${opts.formId}/` : "";
      if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[\w.\- ]{1,80}$/i.test(file.path) || (prefix && !file.path.startsWith(prefix))) errors[f.id] = "Please attach the file again.";
      else if (!fileTypesFor(f.accept).includes(file.type)) errors[f.id] = "This kind of file isn't allowed here.";
      else if (!(file.size > 0 && file.size <= MAX_FILE_BYTES)) errors[f.id] = "Files can be up to 10 MB.";
      else answers[f.id] = { path: file.path, name: file.name.slice(0, 120), size: file.size, type: file.type };
      continue;
    }
    const text = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
    const empty =
      f.type === "checkbox" ? !(Array.isArray(v) && v.length) : f.type === "consent" ? v !== true && v !== "true" && v !== "on" : text === "";
    if (empty) {
      if (f.required) errors[f.id] = f.type === "consent" ? "Please tick this box." : f.type === "checkbox" ? "Pick at least one." : "This is required.";
      continue;
    }
    switch (f.type) {
      case "text":
        if (text.length > 500) errors[f.id] = "Keep it under 500 characters.";
        else answers[f.id] = text;
        break;
      case "textarea":
        if (text.length > 5000) errors[f.id] = "Keep it under 5,000 characters.";
        else answers[f.id] = text;
        break;
      case "email":
        if (!EMAIL.test(text) || text.length > 200) errors[f.id] = "Enter a valid email address.";
        else answers[f.id] = text.toLowerCase();
        break;
      case "phone":
        if (!PHONE.test(text)) errors[f.id] = "Enter a valid phone number.";
        else answers[f.id] = text;
        break;
      case "number": {
        const num = Number(text.replace(/,/g, ""));
        if (!Number.isFinite(num)) errors[f.id] = "Enter a number.";
        else if (f.min !== undefined && num < f.min) errors[f.id] = `The smallest is ${f.min}.`;
        else if (f.max !== undefined && num > f.max) errors[f.id] = `The largest is ${f.max}.`;
        else answers[f.id] = num;
        break;
      }
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) errors[f.id] = "Pick a date.";
        else answers[f.id] = text;
        break;
      case "select":
      case "radio":
        if (!f.options?.some((o) => o.label === text)) errors[f.id] = "Pick one of the options.";
        else answers[f.id] = text;
        break;
      case "checkbox": {
        const list = (v as unknown[]).map(String);
        const valid = list.filter((x, i) => f.options?.some((o) => o.label === x) && list.indexOf(x) === i);
        if (!valid.length) errors[f.id] = "Pick at least one.";
        else answers[f.id] = valid;
        break;
      }
      case "rating": {
        const num = Math.round(Number(text));
        if (!(num >= 1 && num <= 5)) errors[f.id] = "Pick 1 to 5 stars.";
        else answers[f.id] = num;
        break;
      }
      case "consent":
        answers[f.id] = true;
        break;
    }
  }
  const pay = def.settings.payment;
  if (pay?.enabled && pay.custom) {
    const amt = toKobo(raw[AMOUNT_KEY] as string | number);
    // The typed amount is required unless something else on the form already costs money.
    if (amt === 0 && totalFor(def, answers) === 0) errors[AMOUNT_KEY] = "Enter an amount.";
    else if (amt > 0 && amt < pay.min) errors[AMOUNT_KEY] = `The smallest amount is ${naira(pay.min)}.`;
    else if (amt > 0) answers[AMOUNT_KEY] = amt;
  }
  const amount = totalFor(def, answers);
  const emailField = def.fields.find((f) => f.type === "email" && typeof answers[f.id] === "string");
  const email = emailField ? (answers[emailField.id] as string) : "";
  if (amount > 0 && amount < MIN_PAYMENT) errors._form = `Online payments start at ${naira(MIN_PAYMENT)}.`;
  if (amount > 0 && !email) {
    const first = def.fields.find((f) => f.type === "email");
    if (first) errors[first.id] = "Enter your email for the payment receipt.";
    else errors._form = "This form can't take payments: it has no email question. Please tell its owner.";
  }
  return { answers, email, amount, errors };
}

/** A file answer from the browser: a JSON string or an object with path, name, size and type. */
export function parseFile(v: unknown): FileAnswer | null {
  let o: unknown = v;
  if (typeof v === "string") {
    if (!v.trim()) return null;
    try {
      o = JSON.parse(v);
    } catch {
      return null;
    }
  }
  const f = o as Partial<FileAnswer> | null;
  if (!f || typeof f !== "object" || typeof f.path !== "string" || !f.path) return null;
  return { path: f.path, name: String(f.name ?? "file"), size: Number(f.size) || 0, type: String(f.type ?? "") };
}

export const isFileAnswer = (a: unknown): a is FileAnswer => Boolean(a && typeof a === "object" && !Array.isArray(a) && (a as FileAnswer).path);

/** File answers in a set of answers (to verify on submit, or remove with the answer). */
export const filesIn = (answers: Answers) => Object.values(answers).filter(isFileAnswer);

/** Display an answer as text (responses table, CSV, emails). */
export function answerText(a: Answer | undefined, type?: FieldType): string {
  if (a === undefined || a === null) return "";
  if (isFileAnswer(a)) return a.name;
  if (Array.isArray(a)) return a.join(", ");
  if (typeof a === "boolean") return a ? "Yes" : "No";
  if (type === "rating") return `${a} / 5`;
  return String(a);
}

// ---------------------------------------------------------------------------- templates

const opt = (label: string, price?: number): Option => (price ? { id: uid(), label, price } : { id: uid(), label });

export const TEMPLATES: Array<{ key: string; name: string; blurb: string; make: () => FormDef }> = [
  {
    key: "blank",
    name: "Blank form",
    blurb: "Start from nothing",
    make: () => ({ title: "Untitled form", description: "", fields: [{ ...newField("text"), label: "Full name", required: true }], settings: {} }),
  },
  {
    key: "contact",
    name: "Contact us",
    blurb: "Name, email, phone, message",
    make: () => ({
      title: "Contact us",
      description: "Send us a message and we'll get back to you within a day.",
      fields: [
        { id: uid(), type: "text", label: "Full name", required: true },
        { id: uid(), type: "email", label: "Email", required: true },
        { id: uid(), type: "phone", label: "Phone or WhatsApp" },
        { id: uid(), type: "textarea", label: "Your message", required: true },
      ],
      settings: { submit_label: "Send message", success_message: "Thanks! We got your message." },
    }),
  },
  {
    key: "event",
    name: "Event registration",
    blurb: "Tickets with Paystack",
    make: () => ({
      title: "Event registration",
      description: "Register and pay for your ticket. Your receipt comes by email.",
      fields: [
        { id: uid(), type: "text", label: "Full name", required: true },
        { id: uid(), type: "email", label: "Email", required: true },
        { id: uid(), type: "phone", label: "Phone or WhatsApp", required: true },
        { id: uid(), type: "radio", label: "Ticket", required: true, options: [opt("Regular", 500000), opt("VIP", 1500000)] },
        { id: uid(), type: "select", label: "How did you hear about us?", options: [opt("Instagram"), opt("WhatsApp"), opt("A friend"), opt("Other")] },
      ],
      settings: {
        submit_label: "Register and pay",
        success_message: "You're registered! See you there.",
        payment: { enabled: true, amount: 0, custom: false, min: 0, label: "Ticket" },
      },
    }),
  },
  {
    key: "order",
    name: "Order form",
    blurb: "Products with prices",
    make: () => ({
      title: "Place an order",
      description: "Pick what you want, pay online and we'll deliver.",
      fields: [
        { id: uid(), type: "text", label: "Full name", required: true },
        { id: uid(), type: "email", label: "Email", required: true },
        { id: uid(), type: "phone", label: "Phone", required: true },
        { id: uid(), type: "checkbox", label: "What would you like?", required: true, options: [opt("Small tray", 800000), opt("Big tray", 1500000), opt("Drinks pack", 300000)] },
        { id: uid(), type: "textarea", label: "Delivery address", required: true },
      ],
      settings: { submit_label: "Order and pay", payment: { enabled: true, amount: 0, custom: false, min: 0, label: "Order" } },
    }),
  },
  {
    key: "job",
    name: "Job application",
    blurb: "Steps, CV upload, smart questions",
    make: () => {
      const role = { id: uid(), type: "radio" as const, label: "Which role are you applying for?", required: true, options: [opt("Developer"), opt("Designer"), opt("Sales")] };
      return {
        title: "Job application",
        description: "Apply in three short steps. It takes about five minutes.",
        fields: [
          { id: uid(), type: "text", label: "Full name", required: true },
          { id: uid(), type: "email", label: "Email", required: true },
          { id: uid(), type: "phone", label: "Phone or WhatsApp", required: true },
          { id: uid(), type: "page", label: "The role" },
          role,
          { id: uid(), type: "text", label: "GitHub or portfolio link", when: { field: role.id, op: "is", value: "Developer" } },
          { id: uid(), type: "text", label: "Link to your design work", when: { field: role.id, op: "is", value: "Designer" } },
          { id: uid(), type: "select", label: "Years of experience", required: true, options: [opt("Less than 1"), opt("1 to 3"), opt("3 to 5"), opt("More than 5")] },
          { id: uid(), type: "page", label: "Your CV" },
          { id: uid(), type: "file", label: "Upload your CV", required: true, accept: "document" },
          { id: uid(), type: "textarea", label: "Why do you want to join us?" },
        ],
        settings: { submit_label: "Send application", success_message: "Thanks for applying! We'll be in touch within a week." },
      };
    },
  },
  {
    key: "feedback",
    name: "Customer feedback",
    blurb: "Stars and comments",
    make: () => ({
      title: "How did we do?",
      description: "Two minutes to help us serve you better.",
      fields: [
        { id: uid(), type: "rating", label: "How would you rate us?", required: true },
        { id: uid(), type: "radio", label: "Would you recommend us to a friend?", options: [opt("Yes"), opt("Maybe"), opt("No")] },
        { id: uid(), type: "textarea", label: "Anything we could do better?" },
        { id: uid(), type: "email", label: "Email (if you'd like a reply)" },
      ],
      settings: { submit_label: "Send feedback", success_message: "Thank you for your feedback!" },
    }),
  },
  {
    key: "donation",
    name: "Donation",
    blurb: "Pay what you want",
    make: () => ({
      title: "Support our work",
      description: "Every naira helps.",
      fields: [
        { id: uid(), type: "text", label: "Full name" },
        { id: uid(), type: "email", label: "Email", required: true },
        { id: uid(), type: "textarea", label: "A message (optional)" },
      ],
      settings: { submit_label: "Donate", success_message: "Thank you for your support!", payment: { enabled: true, amount: 0, custom: true, min: 100000, label: "Donation" } },
    }),
  },
];
