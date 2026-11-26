"use client";

/**
 * Brand profile, as a 3-step picker (redesigned 26 Nov 2026, Femi: "give options instead of
 * them typing random things").
 *
 *   Step 1  Business   name, type of business (cards), what you sell (tags), price level,
 *                      what makes you different (chips), optional note
 *   Step 2  Customers  who buys (chips), state (dropdown) + area, main goal (cards)
 *   Step 3  Look       tone (cards), colours (ready palettes or your own), platforms,
 *                      posts per week, contact on flyers
 *
 * The database keeps simple text fields (industry, about, audience, location), so the choices
 * are joined into labelled lines here ("Sells: …", "Price: …") and read back the same way when
 * someone edits their brand. Padi's prompt reads those lines directly.
 */
import { useActionState, useMemo, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { Icon, type IconName } from "@/components/icons";
import { PLATFORMS, TONES, type Brand, type Platform, type Tone } from "@/lib/padi/types";
import { cn } from "@/lib/utils";
import { saveBrand } from "../actions";

// ---------------------------------------------------------------------------
// The option lists
// ---------------------------------------------------------------------------
const INDUSTRIES: Array<{ label: string; icon: IconName }> = [
  { label: "Salon and beauty", icon: "sparkle" },
  { label: "Fashion and clothing", icon: "briefcase" },
  { label: "Food and restaurant", icon: "cake" },
  { label: "Shop and retail", icon: "receipt" },
  { label: "Real estate", icon: "pin" },
  { label: "Tech and IT", icon: "monitor" },
  { label: "Education and tutoring", icon: "note" },
  { label: "Health and fitness", icon: "activity" },
  { label: "Church and NGO", icon: "users" },
  { label: "Events and planning", icon: "party" },
  { label: "Photography and media", icon: "camera" },
  { label: "Consulting and services", icon: "chat" },
];

const STRENGTHS = [
  "Affordable prices", "Premium quality", "Fast delivery", "Home service", "Open on weekends",
  "Years of experience", "Online orders", "Free consultation", "Pay on delivery", "Custom orders",
];

const PRICE_LEVELS = ["Budget friendly", "Mid range", "Premium", "Varies by item"];

const AUDIENCES = [
  "Students", "Young adults (18–25)", "Working professionals", "Parents", "Business owners",
  "Women", "Men", "Couples", "High earners", "Budget shoppers", "Diaspora Nigerians",
];

const STATES = [
  "Lagos", "Abuja (FCT)", "Rivers", "Oyo", "Ogun", "Kano", "Kaduna", "Enugu", "Anambra", "Delta", "Edo",
  "Abia", "Adamawa", "Akwa Ibom", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Ebonyi", "Ekiti",
  "Gombe", "Imo", "Jigawa", "Katsina", "Kebbi", "Kogi", "Kwara", "Nasarawa", "Niger", "Ondo", "Osun",
  "Plateau", "Sokoto", "Taraba", "Yobe", "Zamfara", "All over Nigeria", "Outside Nigeria",
];

const GOALS: Array<{ label: string; icon: IconName }> = [
  { label: "More sales", icon: "cash" },
  { label: "More bookings", icon: "calendar" },
  { label: "More followers", icon: "users" },
  { label: "Build trust", icon: "shield" },
  { label: "Launch something new", icon: "zap" },
];

const PALETTES: Array<[string, string, string]> = [
  ["Violet", "#6a4cf5", "#f2a93b"],
  ["Rose", "#d6336c", "#ffd8a8"],
  ["Emerald", "#0f9d6b", "#f7d154"],
  ["Ocean", "#1c7ed6", "#ffe066"],
  ["Night", "#111113", "#f2a93b"],
  ["Coral", "#f76707", "#111113"],
  ["Gold", "#b8860b", "#111113"],
  ["Black", "#111111", "#e9c46a"],
];

// ---------------------------------------------------------------------------
// Reading the saved text back into choices
// ---------------------------------------------------------------------------
/** "Sells: a, b\nPrice: x" → { Sells: "a, b", Price: "x" } */
function lines(text: string) {
  const out: Record<string, string> = {};
  for (const l of text.split("\n")) {
    const m = l.match(/^([A-Za-z ]+):\s*(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}
const list = (v?: string) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : []);

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-[0.85rem] transition duration-200",
        on ? "border-[#111113] bg-[#111113] text-white shadow-[0_6px_16px_-8px_rgba(0,0,0,0.9)]" : "border-slate-200 bg-surface text-slate-700 hover:border-[#a1a1aa] hover:text-[#2a2a2e]",
      )}>
      {on && <Icon name="check" className="mr-1 -ml-0.5 inline h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

function OptionCard({ on, onClick, icon, label, hint }: { on: boolean; onClick: () => void; icon: IconName; label: string; hint?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border p-3 text-left transition duration-200",
        on ? "border-[#111113] bg-[#f4f4f5] ring-1 ring-[#111113]" : "border-slate-200 bg-surface hover:-translate-y-0.5 hover:border-[#a1a1aa]",
      )}>
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition duration-300 group-hover:-rotate-6",
        on ? "bg-[#111113] text-white" : "bg-[#f4f4f5] text-[#6a4cf5]")}>
        <Icon name={icon} className="h-[1.05rem] w-[1.05rem]" />
      </span>
      <span className="min-w-0">
        <b className="block text-[0.88rem] text-slate-900">{label}</b>
        {hint && <span className="block text-[0.74rem] text-slate-500">{hint}</span>}
      </span>
    </button>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <b className="block text-[0.95rem] text-slate-900">{title}</b>
      {hint && <span className="text-[0.8rem] text-slate-500">{hint}</span>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------
export function BrandForm({ brand }: { brand: Brand | null }) {
  const [state, action] = useActionState(saveBrand, undefined);
  const saved = useMemo(() => lines(brand?.about ?? ""), [brand]);
  const savedAudience = useMemo(() => lines(brand?.audience ?? ""), [brand]);

  const [step, setStep] = useState(0);
  const [name, setName] = useState(brand?.name ?? "");
  const known = INDUSTRIES.some((i) => i.label === brand?.industry);
  const [industry, setIndustry] = useState(brand?.industry && known ? brand.industry : brand?.industry ? "Other" : "");
  const [otherIndustry, setOtherIndustry] = useState(brand?.industry && !known ? brand.industry : "");
  const [products, setProducts] = useState<string[]>(list(saved["Sells"]));
  const [productDraft, setProductDraft] = useState("");
  const [price, setPrice] = useState(saved["Price"] ?? "");
  const [strengths, setStrengths] = useState<string[]>(list(saved["Strengths"]));
  const [note, setNote] = useState(saved["Notes"] ?? "");
  const [audience, setAudience] = useState<string[]>(list(savedAudience["Customers"]));
  const [audienceNote, setAudienceNote] = useState(savedAudience["More"] ?? "");
  const [stateName, setStateName] = useState(brand?.location?.split(",").pop()?.trim() || "Lagos");
  const [area, setArea] = useState(brand?.location?.includes(",") ? brand.location.split(",").slice(0, -1).join(",").trim() : "");
  const [goal, setGoal] = useState(saved["Goal"] ?? "");
  const [tone, setTone] = useState<Tone>(brand?.tone ?? "friendly");
  const [primary, setPrimary] = useState(brand?.colors.primary ?? "#6a4cf5");
  const [accent, setAccent] = useState(brand?.colors.accent ?? "#f2a93b");
  const [platforms, setPlatforms] = useState<Platform[]>(brand?.platforms ?? ["instagram", "facebook", "whatsapp"]);
  const [perWeek, setPerWeek] = useState(brand?.posts_per_week ?? 3);
  const [contact, setContact] = useState(brand?.contact ?? "");

  const toggle = <T,>(arr: T[], v: T, set: (x: T[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const addProduct = () => {
    const v = productDraft.trim().replace(/,$/, "");
    if (v && !products.includes(v) && products.length < 12) setProducts([...products, v]);
    setProductDraft("");
  };

  // What gets saved (labelled lines Padi's prompt can read).
  const about = [
    products.length && `Sells: ${products.join(", ")}`,
    price && `Price: ${price}`,
    strengths.length && `Strengths: ${strengths.join(", ")}`,
    goal && `Goal: ${goal}`,
    note.trim() && `Notes: ${note.trim().replace(/\n+/g, " ")}`,
  ].filter(Boolean).join("\n");
  const audienceText = [audience.length && `Customers: ${audience.join(", ")}`, audienceNote.trim() && `More: ${audienceNote.trim()}`].filter(Boolean).join("\n");
  const location = [area.trim(), stateName].filter(Boolean).join(", ");
  const industryText = industry === "Other" ? otherIndustry.trim() : industry;

  const steps = ["Your business", "Your customers", "Your look"];
  const canNext = step === 0 ? Boolean(name.trim() && industryText) : step === 1 ? audience.length > 0 : true;

  return (
    <form
      action={action}
      className="mt-6"
      // Enter in a text box shouldn't save half-way through the steps.
      onKeyDown={(e) => {
        if (e.key === "Enter" && step < 2 && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
    >
      {/* Hidden fields the server action reads */}
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="industry" value={industryText} />
      <input type="hidden" name="about" value={about} />
      <input type="hidden" name="audience" value={audienceText} />
      <input type="hidden" name="location" value={location} />
      <input type="hidden" name="tone" value={tone} />
      <input type="hidden" name="primary" value={primary} />
      <input type="hidden" name="accent" value={accent} />
      <input type="hidden" name="posts_per_week" value={perWeek} />
      <input type="hidden" name="contact" value={contact} />
      {platforms.map((p) => <input key={p} type="hidden" name="platforms" value={p} />)}

      {/* Step indicator */}
      <ol className="mb-6 grid grid-cols-3 gap-2">
        {steps.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => (i <= step || canNext) && setStep(i)} className="w-full text-left">
              <span className="block h-1.5 overflow-hidden rounded-full bg-slate-200">
                <span className={cn("block h-full rounded-full bg-[#111113] transition-all duration-500", i <= step ? "w-full" : "w-0")} />
              </span>
              <span className={cn("mt-2 block text-[0.8rem]", i === step ? "font-semibold text-slate-900" : "text-slate-500")}>{i + 1}. {s}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="rounded-3xl border border-slate-200 bg-surface p-5 sm:p-7">
        {/* Step 1 ------------------------------------------------------------- */}
        {step === 0 && (
          <div className="space-y-7">
            <Section title="Business name">
              <input className="input max-w-md" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ada's Hair Studio" autoFocus />
            </Section>
            <Section title="What kind of business?">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {INDUSTRIES.map((i) => <OptionCard key={i.label} icon={i.icon} label={i.label} on={industry === i.label} onClick={() => setIndustry(i.label)} />)}
                <OptionCard icon="plus" label="Something else" on={industry === "Other"} onClick={() => setIndustry("Other")} />
              </div>
              {industry === "Other" && (
                <input className="input mt-3 max-w-md" value={otherIndustry} onChange={(e) => setOtherIndustry(e.target.value)} maxLength={80} placeholder="Type your kind of business" />
              )}
            </Section>
            <Section title="What do you sell?" hint="Type a product or service and press Enter. Add prices if you like.">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2 focus-within:border-[#a1a1aa]">
                {products.map((p) => (
                  <span key={p} className="flex items-center gap-1 rounded-full bg-[#f4f4f5] py-1 pr-1.5 pl-3 text-[0.85rem] text-[#111113]">
                    {p}
                    <button type="button" onClick={() => setProducts(products.filter((x) => x !== p))} aria-label={`Remove ${p}`} className="rounded-full p-0.5 hover:bg-white">
                      <Icon name="x" className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input value={productDraft} onChange={(e) => setProductDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addProduct(); } }}
                  onBlur={addProduct}
                  className="min-w-40 flex-1 bg-transparent px-1 py-1 text-sm outline-none" placeholder={products.length ? "Add another" : "e.g. Knotless braids ₦25k"} />
              </div>
            </Section>
            <Section title="Your prices are mostly">
              <div className="flex flex-wrap gap-2">{PRICE_LEVELS.map((p) => <Chip key={p} on={price === p} onClick={() => setPrice(price === p ? "" : p)}>{p}</Chip>)}</div>
            </Section>
            <Section title="What makes you different?" hint="Pick all that apply.">
              <div className="flex flex-wrap gap-2">{STRENGTHS.map((s) => <Chip key={s} on={strengths.includes(s)} onClick={() => toggle(strengths, s, setStrengths)}>{s}</Chip>)}</div>
              <input className="input mt-3" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Anything else Padi should know (optional)" />
            </Section>
          </div>
        )}

        {/* Step 2 ------------------------------------------------------------- */}
        {step === 1 && (
          <div className="space-y-7">
            <Section title="Who are your customers?" hint="Pick all that apply.">
              <div className="flex flex-wrap gap-2">{AUDIENCES.map((a) => <Chip key={a} on={audience.includes(a)} onClick={() => toggle(audience, a, setAudience)}>{a}</Chip>)}</div>
              <input className="input mt-3" value={audienceNote} onChange={(e) => setAudienceNote(e.target.value)} maxLength={200} placeholder="Describe them more (optional), e.g. brides-to-be in Lekki" />
            </Section>
            <Section title="Where are you?">
              <div className="grid gap-3 sm:grid-cols-2">
                <select className="input" value={stateName} onChange={(e) => setStateName(e.target.value)} aria-label="State">
                  {STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
                <input className="input" value={area} onChange={(e) => setArea(e.target.value)} maxLength={80} placeholder="Area, e.g. Lekki Phase 1" aria-label="Area" />
              </div>
            </Section>
            <Section title="What do you want most from social media?">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {GOALS.map((g) => <OptionCard key={g.label} icon={g.icon} label={g.label} on={goal === g.label} onClick={() => setGoal(g.label)} />)}
              </div>
            </Section>
          </div>
        )}

        {/* Step 3 ------------------------------------------------------------- */}
        {step === 2 && (
          <div className="space-y-7">
            <Section title="How should Padi sound?">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {TONES.map((t) => <OptionCard key={t.key} icon="chat" label={t.label} hint={t.hint} on={tone === t.key} onClick={() => setTone(t.key)} />)}
              </div>
            </Section>
            <Section title="Brand colours" hint="Pick a palette or set your own.">
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {PALETTES.map(([n, p, a]) => (
                  <button key={n} type="button" onClick={() => { setPrimary(p); setAccent(a); }} aria-pressed={primary === p && accent === a}
                    className={cn("group rounded-xl border p-1.5 transition hover:-translate-y-0.5", primary === p && accent === a ? "border-[#111113] ring-1 ring-[#111113]" : "border-slate-200")}>
                    <span className="flex h-9 overflow-hidden rounded-lg"><i className="flex-[2]" style={{ background: p }} /><i className="flex-1" style={{ background: a }} /></span>
                    <span className="mt-1 block text-[0.7rem] text-slate-600">{n}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-5">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-surface" /> Main
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-surface" /> Highlight
                </label>
                {/* Live mini flyer */}
                <span className="ml-auto flex aspect-[4/5] w-24 flex-col justify-between rounded-xl p-2.5 text-white shadow-md" style={{ background: primary }}>
                  <b className="text-[0.45rem] tracking-[0.14em]">{(name || "YOUR BRAND").toUpperCase().slice(0, 16)}</b>
                  <span className="text-[0.72rem] leading-tight font-semibold">Your next post</span>
                  <span className="w-fit rounded-full px-1.5 py-0.5 text-[0.45rem] font-bold" style={{ background: accent, color: "#111113" }}>Shop now</span>
                </span>
              </div>
            </Section>
            <Section title="Where do you post?">
              <div className="flex flex-wrap gap-2">{PLATFORMS.map((p) => <Chip key={p.key} on={platforms.includes(p.key)} onClick={() => toggle(platforms, p.key, setPlatforms)}>{p.label}</Chip>)}</div>
            </Section>
            <Section title="How often?">
              <div className="flex flex-wrap gap-2">
                {[2, 3, 5, 7, 14].map((n) => <Chip key={n} on={perWeek === n} onClick={() => setPerWeek(n)}>{n === 7 ? "Daily" : n === 14 ? "Twice a day" : `${n} a week`}</Chip>)}
              </div>
            </Section>
            <Section title="Contact to show on flyers">
              <input className="input max-w-md" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={160} placeholder="WhatsApp 0801 234 5678 · @adashair" />
            </Section>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setStep(Math.max(0, step - 1))} className={cn("btn-secondary", step === 0 && "invisible")}>
          <Icon name="arrowLeft" className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-3">
          <FormMessage state={state} />
          {step < 2 ? (
            <button type="button" disabled={!canNext} onClick={() => setStep(step + 1)} className="btn-primary disabled:opacity-50">
              Next <Icon name="arrowRight" className="h-4 w-4" />
            </button>
          ) : (
            <SubmitButton pendingText="Saving…">{brand ? "Save changes" : "Finish and start"}</SubmitButton>
          )}
        </div>
      </div>
    </form>
  );
}
