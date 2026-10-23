import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/utils";
import { meetPageUrl } from "./paths";
import type { NoteSummary } from "./types";

/**
 * Workbase Meet AI notes (Pro Max), SERVER ONLY.
 *
 * The browser of the person who turned AI notes on uploads the meeting's mixed sound in 30-second
 * pieces to the private bucket "meet-audio" (see migration 0054). When the notes stop, this code
 * (with the service-role key):
 *   1. streams the pieces, in order, to AssemblyAI (speech to text, speaker labels, any language);
 *   2. when the transcript is ready (webhook, or a check every ~90 s), puts names on the speakers
 *      using who was talking when (recorded by the browser), and asks Claude to write the notes;
 *   3. saves only the notes (meet_notes.summary), deletes the sound from Storage and the transcript
 *      at AssemblyAI, and emails the notes to their owner.
 * Env: ASSEMBLYAI_API_KEY, ANTHROPIC_API_KEY (server only). Optional: MEET_AI_MODEL (default
 * claude-haiku-5-5), ASSEMBLYAI_BASE / ANTHROPIC_BASE (other regions, or local test stand-ins).
 */
const aai = () => (process.env.ASSEMBLYAI_BASE || "https://api.assemblyai.com").replace(/\/$/, "");
const claude = () => (process.env.ANTHROPIC_BASE || "https://api.anthropic.com").replace(/\/$/, "");
const MODEL = () => process.env.MEET_AI_MODEL || "claude-haiku-5-5";

/** Both AI services set up (and the service-role key the server needs)? */
export const notesConfigured = () =>
  Boolean(process.env.ASSEMBLYAI_API_KEY && process.env.ANTHROPIC_API_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

const WEBHOOK_HEADER = "X-Workbase-Notes";
const secretFor = (id: string) =>
  createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").update(`meet-notes:${id}`).digest("hex");
export function webhookOk(id: string, header: string | null) {
  if (!header) return false;
  const a = Buffer.from(secretFor(id));
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}
export { WEBHOOK_HEADER };

type Due = { id: string; status: string; chunks: number; seconds: number; mime: string; transcript_id: string | null; owner_id: string; attempts: number };
type Utterance = { speaker: string; start: number; end: number; text: string };
type Transcript = { id: string; status: "queued" | "processing" | "completed" | "error"; error?: string; text?: string | null; utterances?: Utterance[] | null; language_code?: string | null; audio_duration?: number | null };

async function aaiFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${aai()}${path}`, {
    ...init,
    headers: { authorization: process.env.ASSEMBLYAI_API_KEY ?? "", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`AssemblyAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function update(admin: SupabaseClient, id: string, patch: Record<string, unknown>) {
  await admin.from("meet_notes").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

/** All sound pieces of a note, in order. */
async function pieces(admin: SupabaseClient, id: string) {
  const { data } = await admin.storage.from("meet-audio").list(id, { limit: 3000, sortBy: { column: "name", order: "asc" } });
  return (data ?? []).map((f) => `${id}/${f.name}`).filter((p) => /\/\d{5}\.(webm|m4a|ogg)$/.test(p)).sort();
}

async function removeSound(admin: SupabaseClient, id: string) {
  const files = await pieces(admin, id);
  for (let i = 0; i < files.length; i += 100) await admin.storage.from("meet-audio").remove(files.slice(i, i + 100));
}

/** Send the sound to AssemblyAI: one upload, streamed piece by piece (never all in memory). */
async function submit(admin: SupabaseClient, note: Due) {
  const files = await pieces(admin, note.id);
  if (!files.length || note.seconds < 15) {
    await update(admin, note.id, { status: "empty", error: null });
    await removeSound(admin, note.id);
    return;
  }
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i >= files.length) return controller.close();
      const { data, error } = await admin.storage.from("meet-audio").download(files[i++]);
      if (error || !data) return controller.error(new Error(`missing piece ${i}`));
      controller.enqueue(new Uint8Array(await data.arrayBuffer()));
    },
  });
  const up = (await (
    await aaiFetch("/v2/upload", { method: "POST", headers: { "content-type": "application/octet-stream" }, body, duplex: "half" } as RequestInit & { duplex: "half" })
  ).json()) as { upload_url: string };

  const site = siteUrl();
  const hook = /^https:\/\//.test(site)
    ? { webhook_url: `${site}/api/meet/notes/webhook?id=${note.id}`, webhook_auth_header_name: WEBHOOK_HEADER, webhook_auth_header_value: secretFor(note.id) }
    : {};
  const t = (await (
    await aaiFetch("/v2/transcript", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        audio_url: up.upload_url,
        speech_models: ["universal-3-5-pro", "universal-2"],
        language_detection: true,
        punctuate: true,
        format_text: true,
        speaker_labels: true,
        ...hook,
      }),
    })
  ).json()) as { id: string };
  await update(admin, note.id, { status: "transcribing", transcript_id: t.id, error: null });
}

/** Check a transcript; finish the notes when it's ready. */
export async function checkTranscript(admin: SupabaseClient, id: string, transcriptId: string) {
  const t = (await (await aaiFetch(`/v2/transcript/${encodeURIComponent(transcriptId)}`)).json()) as Transcript;
  if (t.status === "error") {
    await update(admin, id, { status: "failed", error: (t.error || "The speech service couldn't read the sound.").slice(0, 300) });
    await cleanupProvider(admin, id, transcriptId);
    return "failed";
  }
  if (t.status !== "completed") return t.status;
  await finish(admin, id, t);
  return "ready";
}

/** Who was speaking when (from the browser): [[seconds from start, name], …] → names for "Speaker A". */
export function nameSpeakers(utterances: Utterance[], timeline: Array<[number, string]>) {
  const tl = [...timeline].filter((e) => Array.isArray(e) && typeof e[0] === "number" && typeof e[1] === "string").sort((a, b) => a[0] - b[0]);
  const votes = new Map<string, Map<string, number>>();
  for (const u of utterances) {
    const s = u.start / 1000;
    const e = u.end / 1000;
    for (let i = 0; i < tl.length; i++) {
      const from = tl[i][0];
      const to = i + 1 < tl.length ? tl[i + 1][0] : from + 3;
      const overlap = Math.min(e, to) - Math.max(s, from);
      if (overlap <= 0 || !tl[i][1]) continue;
      const m = votes.get(u.speaker) ?? new Map<string, number>();
      m.set(tl[i][1], (m.get(tl[i][1]) ?? 0) + overlap);
      votes.set(u.speaker, m);
    }
  }
  // Strongest matches first; each name goes to one label only.
  const pairs: Array<[string, string, number, number]> = [];
  for (const [label, m] of votes) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    for (const [name, v] of m) pairs.push([label, name, v, v / total]);
  }
  pairs.sort((a, b) => b[2] - a[2]);
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const [label, name, , share] of pairs) {
    if (names.has(label) || used.has(name) || share < 0.4) continue;
    names.set(label, name);
    used.add(name);
  }
  return names;
}

const TOOL = {
  name: "save_notes",
  description: "Save the meeting notes.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "A short title for the meeting (max 8 words)." },
      overview: { type: "string", description: "3–5 plain sentences: what the meeting was about and how it ended." },
      key_points: { type: "array", items: { type: "string" }, description: "The main points discussed, one short sentence each." },
      decisions: { type: "array", items: { type: "string" }, description: "What was decided. Empty if nothing was decided." },
      action_items: {
        type: "array",
        items: {
          type: "object",
          properties: { task: { type: "string" }, owner: { type: "string", description: "Who will do it, if said; else empty." }, due: { type: "string", description: "When, if said; else empty." } },
          required: ["task"],
        },
      },
      questions: { type: "array", items: { type: "string" }, description: "Open questions left for later. Empty if none." },
    },
    required: ["title", "overview", "key_points", "decisions", "action_items", "questions"],
  },
} as const;

async function summarise(transcript: string, meta: { title: string; minutes: number; language: string | null; people: string[] }) {
  const res = await fetch(`${claude()}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: 4000,
      system:
        "You write clear, faithful meeting notes from a transcript. Only include what was actually said; never invent names, numbers, dates or decisions. " +
        "Write in the same language the meeting was held in, in plain words. Speaker names may be labels like 'Speaker A' when unknown: keep them as they are. " +
        "If the transcript is mostly silence or noise, say so briefly in the overview and leave the lists empty.",
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: `Meeting: ${meta.title || "(no title)"}\nLength: about ${meta.minutes} minutes\nLanguage detected: ${meta.language || "unknown"}\nPeople heard: ${meta.people.join(", ") || "unknown"}\n\nTranscript:\n<transcript>\n${transcript}\n</transcript>`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const out = (await res.json()) as { content?: Array<{ type: string; name?: string; input?: unknown }> };
  const call = out.content?.find((c) => c.type === "tool_use" && c.name === TOOL.name);
  if (!call?.input) throw new Error("Claude didn't return the notes");
  return call.input as Omit<NoteSummary, "language" | "people" | "minutes">;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max: number, len: number) => (Array.isArray(v) ? v.map((x) => str(x, len)).filter(Boolean).slice(0, max) : []);

async function finish(admin: SupabaseClient, id: string, t: Transcript) {
  const { data: note } = await admin.from("meet_notes").select("id, owner_id, title, seconds, speakers, status").eq("id", id).maybeSingle();
  if (!note || note.status === "ready") return;
  const utterances = t.utterances ?? [];
  const names = nameSpeakers(utterances, (note.speakers ?? []) as Array<[number, string]>);
  const label = (s: string) => names.get(s) ?? `Speaker ${s}`;
  const lines: string[] = [];
  for (const u of utterances) {
    const who = label(u.speaker);
    const last = lines.length ? lines[lines.length - 1] : "";
    if (last.startsWith(`${who}: `)) lines[lines.length - 1] = `${last} ${u.text}`;
    else lines.push(`${who}: ${u.text}`);
  }
  const text = (lines.length ? lines.join("\n") : t.text ?? "").slice(0, 600_000);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 20) {
    await update(admin, id, { status: "empty", summary: null, error: null });
    await cleanupProvider(admin, id, t.id);
    return;
  }
  const minutes = Math.max(1, Math.round((t.audio_duration ?? note.seconds) / 60));
  const people = [...new Set(utterances.map((u) => label(u.speaker)))];
  const raw = await summarise(text, { title: note.title, minutes, language: t.language_code ?? null, people });
  const summary: NoteSummary = {
    title: str(raw.title, 120) || note.title || "Meeting notes",
    overview: str(raw.overview, 3000),
    key_points: list(raw.key_points, 30, 500),
    decisions: list(raw.decisions, 30, 500),
    action_items: (Array.isArray(raw.action_items) ? raw.action_items : [])
      .map((a) => ({ task: str(a?.task, 400), owner: str(a?.owner, 80), due: str(a?.due, 80) }))
      .filter((a) => a.task)
      .slice(0, 40),
    questions: list(raw.questions, 20, 500),
    language: t.language_code ?? null,
    people: people.slice(0, 50),
    minutes,
  };
  await update(admin, id, { status: "ready", summary, error: null, title: note.title || summary.title.slice(0, 120) });
  await cleanupProvider(admin, id, t.id);
  await emailNotes(admin, id, note.owner_id, summary);
}

/** Delete the transcript at AssemblyAI and our copy of the sound. */
async function cleanupProvider(admin: SupabaseClient, id: string, transcriptId: string | null) {
  if (transcriptId) await aaiFetch(`/v2/transcript/${encodeURIComponent(transcriptId)}`, { method: "DELETE" }).catch(() => undefined);
  await removeSound(admin, id).catch(() => undefined);
}

async function emailNotes(admin: SupabaseClient, id: string, owner: string, s: NoteSummary) {
  const { data: p } = await admin.from("profiles").select("email").eq("id", owner).maybeSingle();
  if (!p?.email) return;
  const actions = s.action_items.length
    ? `\n\nAction items:\n${s.action_items.map((a) => `• ${a.task}${a.owner ? ` (${a.owner})` : ""}${a.due ? `, ${a.due}` : ""}`).join("\n")}`
    : "";
  const sent = await sendEmail([p.email], {
    subject: `Meeting notes: ${s.title}`,
    heading: s.title,
    text: `${s.overview}${actions}`,
    link: "",
    url: meetPageUrl(`/notes/${id}`, siteUrl()),
    button: "Open the notes",
    footer: "Sent by Workbase Meet because you turned on AI notes in this meeting.",
  });
  if (sent) await update(admin, id, { emailed_at: new Date().toISOString() });
}

/** Work through every note that's due (called by the database every minute, and after stopping). */
export async function processDueNotes() {
  if (!notesConfigured()) return { skipped: "AI notes aren't set up" };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("meet_notes_due");
  if (error) throw new Error(error.message);
  const done: Record<string, string> = {};
  for (const n of (data ?? []) as Due[]) {
    try {
      if (!n.transcript_id) {
        await submit(admin, n);
        done[n.id] = "submitted";
      } else {
        done[n.id] = await checkTranscript(admin, n.id, n.transcript_id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      done[n.id] = `error: ${msg}`;
      // Try again on the next run (meet_notes_due gives up after 6 tries).
      await update(admin, n.id, { status: n.transcript_id ? "transcribing" : "queued", error: msg.slice(0, 300) });
    }
  }
  return { done };
}

/** Nightly: notes older than 90 days go; leftover sound of finished notes goes. */
export async function cleanupNotes(admin: SupabaseClient) {
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data: old } = await admin.from("meet_notes").select("id").lt("created_at", cutoff).limit(500);
  for (const n of old ?? []) await removeSound(admin, n.id).catch(() => undefined);
  if (old?.length) await admin.from("meet_notes").delete().in("id", old.map((n) => n.id));
  const { data: finished } = await admin
    .from("meet_notes")
    .select("id")
    .in("status", ["ready", "failed", "empty"])
    .gt("chunks", 0)
    .lt("updated_at", new Date(Date.now() - 3_600_000).toISOString())
    .gt("updated_at", new Date(Date.now() - 3 * 86_400_000).toISOString())
    .limit(300);
  for (const n of finished ?? []) await removeSound(admin, n.id).catch(() => undefined);
  return { removed: old?.length ?? 0 };
}
