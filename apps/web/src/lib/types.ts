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
