// Public settings for the desktop app. The anon key is safe to ship in the app:
// every database call is still checked by row-level security and the agent functions.
// NEVER put the service_role key here.

export const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://eacdtfbntkxrpfibblak.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhY2R0ZmJudGt4cnBmaWJibGFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5NjU3ODAsImV4cCI6MjEwNzU0MTc4MH0.ddnPEbI-QADxQOuBFx_AWWIr7bquliDtQK-O9d4AM2E";

/** Where the web dashboard runs (for "Open dashboard" and "Forgot password"). */
export const DASHBOARD_URL = (process.env.DASHBOARD_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const APP_NAME = "Workforce";

// Timings
export const TICK_SECONDS = 10; // how often activity is sampled
export const HEARTBEAT_SECONDS = 60; // live status to the server
export const SYNC_SECONDS = 120; // upload queued data
export const BLOCK_SECONDS = 600; // 10-minute activity blocks
export const ACTIVE_IF_IDLE_UNDER = 10; // seconds without input still counted as active
export const MAX_TICK_GAP_SECONDS = 60; // a longer gap (sleep, freeze) is not counted
export const AUTO_CLOCK_OUT_IDLE_MINUTES = 60; // clock out after this much continuous idle
export const RESUME_SESSION_WITHIN_MINUTES = 5; // app restarted quickly: keep the same session
