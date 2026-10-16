// Shapes returned by the console's database functions (admin_overview, admin_companies, admin_company).

export type Daily = {
  day: string;
  signups: number;
  companies: number;
  active_companies: number;
  people_tracking: number;
  meetings: number;
  meet_minutes: number;
  bookings: number;
  revenue: Record<string, number>; // kobo per product
};

export type Overview = {
  days: number;
  generated_at: string;
  totals: {
    accounts: number;
    accounts_7d: number;
    companies: number;
    companies_7d: number;
    active_companies_7d: number;
    people_tracking_7d: number;
    working_now: number;
    paying_companies: number;
    trial_companies: number;
    meet_live: number;
    meet_meetings_7d: number;
    meet_minutes_7d: number;
    meet_paid_hosts: number;
    book_pages: number;
    book_pages_payouts: number;
    book_pro: number;
    book_bookings_7d: number;
    failed_payments_7d: number;
  };
  money: { all_time: Record<string, number>; this_month: Record<string, number>; last_30_days: Record<string, number> };
  daily: Daily[];
  funnel: { signed_up: number; created_company: number; invited_team: number; first_clock_in: number; paid: number };
  trials_ending: Array<{ id: string; name: string; trial_ends_at: string; members: number; last_clock_in: string | null }>;
  recent_payments: Array<{ product: string; status: "success" | "failed"; amount_kobo: number; at: string; who: string | null; organization_id: string | null; failure_reason: string | null }>;
  app_versions: Array<{ version: string; devices: number }>;
};

export type Tier = "free" | "trial" | "standard" | "pro";

export type CompanyRow = {
  id: string;
  name: string;
  created_at: string;
  closing_at: string | null;
  trial_ends_at: string;
  tier: Tier;
  paid_until: string | null;
  active_members: number;
  owner: string | null;
  owner_email: string | null;
  pending_invites: number;
  last_clock_in: string | null;
  support_until: string | null;
};

export type Member = {
  user_id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "manager" | "worker";
  status: "active" | "suspended" | "removed";
  joined_at: string;
  timezone: string;
  can_track: boolean;
  last_clock_in: string | null;
  open_session: { started_at: string; last_heartbeat_at: string | null; source: "desktop" | "phone" } | null;
  lost_7d: number;
  devices: Array<{ os: string; version: string; last_seen_at: string | null }>;
  push: boolean;
};

export type CompanyDetail = {
  company: {
    id: string;
    name: string;
    slug: string;
    country_code: string;
    timezone: string;
    created_at: string;
    closing_at: string | null;
    purge_after: string | null;
    tier: Tier;
    seat_limit: number | null;
    paid_seats: number;
    paid_until: string | null;
    trial_ends_at: string;
    active_members: number;
    settings: Record<string, unknown>;
  };
  support_until: string | null;
  latest_agent: string | null;
  members: Member[];
  invites: Array<{ email: string; role: string; created_at: string; expires_at: string }>;
  payments: Array<{
    reference: string; kind: string; plan: string; seats: number; months: number; amount_kobo: number;
    status: "pending" | "success" | "failed"; failure_reason: string | null; created_at: string; paid_at: string | null; period_end: string | null;
  }>;
  meet_business: boolean;
  notes: Array<{ id: number; author: string; body: string; created_at: string }>;
  support_views: Array<{ viewer: string; section: string; created_at: string }>;
  deep: null | {
    hours: Array<{ user_id: string; day: string; worked_seconds: number; active_seconds: number }>;
    sessions: Array<{ user_id: string; started_at: string; ended_at: string | null; end_reason: string | null; source: string; last_heartbeat_at: string | null; agent_version: string | null; os: string | null }>;
    tasks: { by_status: Record<string, number>; overdue: number; projects: number };
    leave: Array<{ user_id: string; type: string; start_date: string; end_date: string; days: number; status: string }>;
    changes: Array<{ at: string; action: string; by: string }>;
  };
};

export const PRODUCT_LABEL: Record<string, string> = {
  workbase_standard: "Workbase Standard",
  workbase_pro: "Workbase Pro",
  meet_pro: "Meet Pro",
  meet_business: "Meet Business",
  book_pro: "Book Pro",
  book_fees: "Book 3% fees",
};
export const productLabel = (p: string) => PRODUCT_LABEL[p] ?? p;

export const TIER_TEXT: Record<Tier, string> = { free: "Free", trial: "Trial", standard: "Standard", pro: "Pro" };
export const TIER_BADGE: Record<Tier, string> = {
  free: "bg-slate-100 text-slate-600",
  trial: "bg-sky-50 text-sky-700",
  standard: "bg-brand-50 text-brand-700",
  pro: "bg-marigold-100 text-marigold-700",
};

const TZ = "Africa/Lagos";
/** "16 Oct, 09:05" in Lagos time. */
export const when = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";
/** "16 Oct 2026" in Lagos time. */
export const day = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "—";
/** "3 h ago", "2 days ago", "in 4 days". */
export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "never";
  const diff = Math.round((now - Date.parse(iso)) / 60_000);
  const abs = Math.abs(diff);
  const text = abs < 2 ? "just now" : abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} days`;
  if (text === "just now") return text;
  return diff >= 0 ? `${text} ago` : `in ${text}`;
}
