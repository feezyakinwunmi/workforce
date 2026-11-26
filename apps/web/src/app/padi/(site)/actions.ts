"use server";

/**
 * Bizz Padi server actions (26 Nov 2026).
 *
 * Every read and write goes through the signed-in person's own Supabase login, so the database
 * rules (owner only) apply. The AI is called here on the server; keys never reach the browser.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { planWeek, writePost, type WrittenPost } from "@/lib/padi/brain";
import { padiAiReady } from "@/lib/padi/ai";
import { FLYER_STYLES, myBrand, padiRequestBase, PLATFORMS, requirePadiUser, TONES, type Platform, type Tone } from "@/lib/padi/server";
import type { FormState } from "@/lib/types";

/** A hex colour like #6a4cf5, or the fallback. */
const hex = (v: FormDataEntryValue | null, fallback: string) => {
  const s = String(v ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : fallback;
};

// ---------------------------------------------------------------------------
// Brand profile
// ---------------------------------------------------------------------------
export async function saveBrand(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requirePadiUser();
  const text = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);

  const name = text("name", 80);
  if (!name) return { error: "Enter your business name." };

  const tone = (TONES.some((t) => t.key === formData.get("tone")) ? formData.get("tone") : "friendly") as Tone;
  const platforms = formData.getAll("platforms").map(String).filter((p): p is Platform => PLATFORMS.some((x) => x.key === p));
  if (platforms.length === 0) return { error: "Pick at least one place you post." };

  const row = {
    name,
    industry: text("industry", 80),
    about: text("about", 1500),
    audience: text("audience", 600),
    location: text("location", 120),
    contact: text("contact", 160),
    tone,
    platforms,
    colors: { primary: hex(formData.get("primary"), "#6a4cf5"), accent: hex(formData.get("accent"), "#f2a93b") },
    posts_per_week: Math.min(14, Math.max(1, Number(formData.get("posts_per_week")) || 3)),
  };

  const existing = await myBrand(supabase);
  const { error } = existing
    ? await supabase.from("padi_brands").update(row).eq("id", existing.id)
    : await supabase.from("padi_brands").insert(row);
  if (error) return { error: "Couldn't save your brand. Try again." };

  revalidatePath("/padi", "layout");
  // First time: straight to the chat with a welcome. Later edits: stay and say saved.
  if (!existing) redirect(`${(await padiRequestBase()) || "/"}?welcome=1`);
  return { success: "Saved. Padi will use this for every post." };
}

// ---------------------------------------------------------------------------
// Chat: one message in, Padi's reply (and usually a post) out
// ---------------------------------------------------------------------------
export type ChatState = { error?: string; at?: number } | undefined;

/** What the chat gets back after one message: both new messages, so it can show them without reloading the page. */
export type ChatReply =
  | { ok: true; user: { id: string; content: string }; reply: { id: string; content: string; post: ChatPostOut | null } }
  | { ok: false; error: string };
export type ChatPostOut = { id: string; topic: string; flyer: WrittenPost["flyer"]; captions: WrittenPost["captions"] };

/** Save a post Padi wrote, return its id. */
async function savePost(supabase: Awaited<ReturnType<typeof requirePadiUser>>["supabase"], brandId: string, p: WrittenPost) {
  const { data, error } = await supabase
    .from("padi_posts")
    .insert({ brand_id: brandId, topic: p.topic, captions: p.captions, hashtags: p.hashtags, flyer: p.flyer, planned_for: p.plannedFor })
    .select("id")
    .single();
  if (error) throw new Error(error.message.includes("rate") ? "You've made a lot of posts today. Try again tomorrow." : "Couldn't save the post.");
  return (data as { id: string }).id;
}

/**
 * One chat message. Called directly from the chat (not as a form action) and returns the two
 * new messages. It deliberately does NOT refresh the page: re-rendering the whole page after a
 * slow AI call is what made the page crash on 26 Nov 2026. The calendar and "coming up" list
 * pick up new posts the next time they're opened.
 */
export async function sendChat(message: string): Promise<ChatReply> {
  const { supabase } = await requirePadiUser();
  const text = String(message ?? "").trim().slice(0, 2000);
  if (!text) return { ok: false, error: "Type what you want to post about." };
  if (!padiAiReady()) return { ok: false, error: "Padi's brain isn't switched on yet." };

  const brand = await myBrand(supabase);
  if (!brand) return { ok: false, error: "Set up your brand first (My brand in the menu)." };

  // Save the person's message and read the last few messages at the same time.
  const [{ data: mine, error: inErr }, { data: recent }] = await Promise.all([
    supabase.from("padi_messages").insert({ role: "user", content: text }).select("id").single(),
    supabase.from("padi_messages").select("role, content").order("created_at", { ascending: false }).limit(6),
  ]);
  if (inErr || !mine) return { ok: false, error: "Slow down a little: too many messages this hour." };
  const history = ((recent ?? []) as Array<{ role: "user" | "assistant"; content: string }>).reverse();
  // The read may or may not already include the message we just saved; drop it so it isn't sent twice.
  if (history.at(-1)?.role === "user" && history.at(-1)?.content === text) history.pop();

  try {
    const out = await writePost(brand, text, history);
    const postId = out.post ? await savePost(supabase, brand.id, out.post) : null;
    const { data: reply } = await supabase
      .from("padi_messages")
      .insert({ role: "assistant", content: out.reply, post_id: postId })
      .select("id")
      .single();
    return {
      ok: true,
      user: { id: (mine as { id: string }).id, content: text },
      reply: {
        id: (reply as { id: string } | null)?.id ?? crypto.randomUUID(),
        content: out.reply,
        post: out.post && postId ? { id: postId, topic: out.post.topic, flyer: out.post.flyer, captions: out.post.captions } : null,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong. Try again." };
  }
}

// ---------------------------------------------------------------------------
// Plan my week: fills the calendar with the brand's posts_per_week
// ---------------------------------------------------------------------------
export async function planMyWeek(_prev: ChatState, _formData: FormData): Promise<ChatState> {
  const { supabase } = await requirePadiUser();
  if (!padiAiReady()) return { error: "Padi's brain isn't switched on yet. Femi needs to add an AI key." };
  const brand = await myBrand(supabase);
  if (!brand) redirect(`${await padiRequestBase()}/setup`);

  try {
    const posts = await planWeek(brand, brand.posts_per_week);
    if (posts.length === 0) return { error: "Padi couldn't plan the week. Try again." };
    for (const p of posts) await savePost(supabase, brand.id, p);
    await supabase.from("padi_messages").insert({
      role: "assistant",
      content: `I've planned ${posts.length} posts for the coming week. They're in your Calendar: approve the ones you like.`,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong. Try again." };
  }
  revalidatePath("/padi", "layout");
  redirect(`${await padiRequestBase()}/posts?planned=1`);
}

// ---------------------------------------------------------------------------
// Post status and edits
// ---------------------------------------------------------------------------
export async function setPostStatus(formData: FormData) {
  const { supabase } = await requirePadiUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["draft", "approved", "posted", "skipped"].includes(status)) return;
  await supabase.from("padi_posts").update({ status }).eq("id", id);
  revalidatePath("/padi", "layout");
}

export async function savePostEdits(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await requirePadiUser();
  const imagePath = String(formData.get("image") ?? "");
  const id = String(formData.get("id") ?? "");
  const captions: Partial<Record<Platform, string>> = {};
  for (const p of PLATFORMS) {
    const v = formData.get(`caption_${p.key}`);
    if (typeof v === "string" && v.trim()) captions[p.key] = v.trim().slice(0, 2200);
  }
  const when = String(formData.get("planned_for") ?? ""); // "YYYY-MM-DDTHH:MM" in Lagos time
  const planned_for = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when) ? new Date(`${when}:00+01:00`).toISOString() : null;
  const flyer = {
    headline: String(formData.get("headline") ?? "").slice(0, 60),
    subline: String(formData.get("subline") ?? "").slice(0, 110),
    cta: String(formData.get("cta") ?? "").slice(0, 30),
    style: FLYER_STYLES.some((f) => f.key === formData.get("style")) ? String(formData.get("style")) : "bold",
    // The person's own picture: only a path inside their own folder is accepted.
    ...(imagePath && imagePath.startsWith(`${user.id}/`) && /^[\w-]+\/[\w.-]+\.(jpe?g|png|webp)$/i.test(imagePath) ? { image: imagePath } : {}),
  };
  const { data, error } = await supabase.from("padi_posts").update({ captions, planned_for, flyer }).eq("id", id).select("id");
  if (error || !data?.length) return { error: "Couldn't save. Try again." };
  revalidatePath("/padi", "layout");
  return { success: "Saved." };
}

export async function deletePost(formData: FormData) {
  const { supabase } = await requirePadiUser();
  await supabase.from("padi_posts").delete().eq("id", String(formData.get("id") ?? ""));
  revalidatePath("/padi", "layout");
  redirect(`${await padiRequestBase()}/posts`);
}
