/**
 * Bizz Padi's "brain": the instructions it follows and the shape of what it returns (26 Nov 2026).
 *
 * Two jobs in phase 1:
 *   writePost()  answer one chat message: a short friendly reply + (when it's a post request) a
 *                full post: captions per platform, hashtags, flyer text and a suggested time.
 *   planWeek()   fill the coming week with N post ideas for the brand.
 *
 * Every rule that keeps posts safe and honest lives in RULES below, so it's easy to read and change.
 */
import { askJson, type ChatTurn } from "./ai";
import type { Brand, Flyer, FlyerStyle, Platform } from "./types";

/** What the model must return for one post. */
type RawPost = {
  topic?: string;
  captions?: Partial<Record<Platform, string>>;
  hashtags?: string[];
  flyer?: Flyer;
  best_time?: string; // "YYYY-MM-DDTHH:MM" in Africa/Lagos time
};

export type WrittenPost = {
  topic: string;
  captions: Partial<Record<Platform, string>>;
  hashtags: string[];
  flyer: Flyer;
  plannedFor: string | null; // ISO UTC
};

const RULES = `
Rules you always follow:
- Write like a sharp Nigerian social media manager who knows this business well. Short sentences. One idea per post. Real, specific details from the brand profile.
- Never invent prices, discounts, awards, customer numbers, reviews or testimonials. If a detail (price, date, address) is needed but missing, write [ADD PRICE] style placeholders.
- No hate, no politics, no religion jokes, no mocking tribes, genders, customers or workers. Bold opinions are fine; insults are not.
- Never copy song lyrics or other people's content.
- Each platform gets its own caption: Instagram (hook first line, emojis ok, 3-5 hashtags handled separately), Facebook (conversational, ends with a question), LinkedIn (professional insight, no hashtag spam), X (under 260 characters, punchy), TikTok (very short caption for a video), WhatsApp Status (one or two lines + call to action).
- Only write captions for the platforms listed in the brand profile.
- Flyer text must be very short: headline max 6 words, subline max 12 words, cta max 4 words.
- Pick a flyer style: "bold" (big headline), "clean" (simple, premium), "promo" (sale/offer), "quote" (tip or saying).
- Best posting times in Nigeria (WAT): weekdays 7-9am, 12-2pm, 7-9pm; Saturday 10am-1pm. Pick a time that fits the platform.
`.trim();

/** The brand profile, written out for the model. */
function profile(b: Brand) {
  return `
Brand profile:
- Name: ${b.name}
- Industry: ${b.industry || "not given"}
- What they sell / what makes them different: ${b.about || "not given"}
- Customers: ${b.audience || "not given"}
- Location: ${b.location || "not given"}
- Tone of voice: ${b.tone}
- Contact shown on posts: ${b.contact || "not given"}
- Platforms: ${b.platforms.join(", ")}
`.trim();
}

/** Today in Lagos, so "Friday" and "next week" are worked out correctly. */
function today() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", dateStyle: "full", timeStyle: "short" }).format(new Date());
}

/** "2026-11-28T19:30" in Lagos time → ISO UTC (Lagos is UTC+1 all year, no daylight saving). */
function lagosToUtc(local?: string): string | null {
  if (!local || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local)) return null;
  const d = new Date(`${local.slice(0, 16)}:00+01:00`);
  if (Number.isNaN(d.getTime()) || d.getTime() < Date.now() - 3600_000) return null;
  return d.toISOString();
}

/** Clean what came back: only allowed platforms, trimmed lengths, safe flyer style. */
function tidy(raw: RawPost, b: Brand, fallbackTopic: string): WrittenPost {
  const captions: Partial<Record<Platform, string>> = {};
  for (const p of b.platforms) {
    const c = raw.captions?.[p];
    if (typeof c === "string" && c.trim()) captions[p] = c.trim().slice(0, 2200);
  }
  const styles: FlyerStyle[] = ["bold", "clean", "promo", "quote"];
  const f = raw.flyer ?? {};
  return {
    topic: String(raw.topic || fallbackTopic).trim().slice(0, 300) || fallbackTopic.slice(0, 300),
    captions,
    hashtags: (raw.hashtags ?? [])
      .filter((h) => typeof h === "string")
      .map((h) => "#" + h.replace(/^#+/, "").replace(/\s+/g, ""))
      .filter((h) => h.length > 1)
      .slice(0, 8),
    flyer: {
      headline: String(f.headline ?? "").slice(0, 60),
      subline: String(f.subline ?? "").slice(0, 110),
      cta: String(f.cta ?? "").slice(0, 30),
      style: styles.includes(f.style as FlyerStyle) ? (f.style as FlyerStyle) : "bold",
    },
    plannedFor: lagosToUtc(raw.best_time),
  };
}

/**
 * One chat turn. `history` = the last few messages (oldest first) so Padi remembers the thread.
 * Returns Padi's reply, and a post when the message asked for content.
 */
export async function writePost(b: Brand, message: string, history: ChatTurn[]) {
  const system = `You are Bizz Padi, a friendly AI social media manager for small businesses in Nigeria.
Today is ${today()} (Lagos time).

${profile(b)}

${RULES}

Reply ONLY with a JSON object:
{
  "reply": "your short chat answer (1-3 sentences), in the brand's tone",
  "post": null OR {
    "topic": "what the post is about, max 10 words",
    "captions": { "<platform>": "caption", ... },
    "hashtags": ["#tag", ...],
    "flyer": { "headline": "...", "subline": "...", "cta": "...", "style": "bold|clean|promo|quote" },
    "best_time": "YYYY-MM-DDTHH:MM (Lagos time, in the future)"
  }
}
Use "post": null only when the message is a question or small talk, not a content request. When unsure, write the post.`;

  const out = await askJson<{ reply?: string; post?: RawPost | null }>(system, [...history, { role: "user", content: message }]);
  return {
    reply: String(out.reply || "Here's a post for you.").slice(0, 1500),
    post: out.post ? tidy(out.post, b, message) : null,
  };
}

/** Fill the next 7 days with `count` posts (a mix of product, tips, behind-the-scenes, offers, engagement). */
export async function planWeek(b: Brand, count: number) {
  const system = `You are Bizz Padi, a friendly AI social media manager for small businesses in Nigeria.
Today is ${today()} (Lagos time).

${profile(b)}

${RULES}

Plan the next 7 days: exactly ${count} posts, spread across different days, mixing these kinds:
showcase a product or service, a useful tip for customers, behind the scenes, an engagement question or poll,
a customer problem you solve, and (at most one) an offer with [ADD PRICE] placeholders if no price is known.
Use current Nigerian moments when relevant (salary week, weekends, holidays, December), never tragedies or politics.

Reply ONLY with a JSON object: { "posts": [ { "topic", "captions", "hashtags", "flyer", "best_time" }, ... ] }`;

  const out = await askJson<{ posts?: RawPost[] }>(system, [{ role: "user", content: `Plan my next ${count} posts.` }], 6000);
  return (out.posts ?? []).slice(0, count).map((p, i) => tidy(p, b, `Post ${i + 1}`));
}
