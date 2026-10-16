export type MemberRole = "owner" | "admin" | "manager" | "worker";
export type MemberStatus = "active" | "suspended" | "removed";

export type OrgSettings = {
  idle_timeout_minutes: number;
  track_apps: boolean;
  track_urls: boolean;
  screenshots_enabled: boolean;
  screenshot_interval_minutes: number;
  blur_screenshots: boolean;
  phone_clock?: boolean; // default on
  phone_location?: "off" | "ask" | "required"; // default "ask"
  work_start?: string; // "09:00" company working hours (people can set their own)
  work_end?: string; // "17:00"
  work_days?: number[]; // ISO weekdays, 1 = Monday; default [1,2,3,4,5]
  clock_reminders?: boolean; // default on
  screenshots_changed_at?: string | null; // set by the database; the desktop app asks workers to agree to this version
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  country_code: string;
  timezone: string;
  billing_currency: "NGN" | "USD";
  plan: "trial" | "basic" | "pro" | "business";
  trial_ends_at: string;
  settings: OrgSettings;
  created_at: string;
  closing_at?: string | null; // the owner closed the company; data is deleted at purge_after
  purge_after?: string | null;
  logo_path?: string | null; // company-logos/<org>/<uuid>.<ext>, public
};

export type Membership = {
  id: string;
  organization_id: string;
  user_id: string;
  role: MemberRole;
  status: MemberStatus;
  team_id: string | null;
  job_title: string | null;
  timezone: string;
  expected_hours_per_day: number;
  joined_at: string;
  work_start?: string | null; // "09:00:00"; null = the company's hours
  work_end?: string | null;
  reminders?: boolean; // clock-in / clock-out reminders
};

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
};

export type Team = {
  id: string;
  name: string;
  manager_id: string | null;
};

export type Invitation = {
  id: string;
  email: string;
  role: MemberRole;
  team_id: string | null;
  token: string;
  expires_at: string;
  created_at: string;
};

/** Shape returned by server actions to forms (used with useActionState). */
export type FormState = { error?: string; success?: string } | undefined;

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  worker: "Worker",
};

export const isAdminRole = (role: MemberRole) => role === "owner" || role === "admin";
