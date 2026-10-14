import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import type { SecureStore } from "./storage";
import type { Payload, Settings, TaskItem } from "./tracker";

export type DeviceInfo = {
  device_id: string;
  organization_id: string;
  organization_name: string;
  role: string;
  timezone: string;
  full_name: string;
  settings: Settings;
  server_time: string;
};

export type HeartbeatResult = {
  active: boolean;
  device_revoked?: boolean;
  settings?: Settings;
  server_time: string;
};

export type AgentNotification = {
  id: string;
  kind: "task_assigned" | "task_comment" | "task_done" | "task_due";
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
};

/** Error kinds the app reacts to differently. */
export class ApiError extends Error {
  constructor(
    message: string,
    public kind: "offline" | "auth" | "revoked" | "not_registered" | "inactive" | "other",
  ) {
    super(message);
  }
}

function classify(error: { message?: string; code?: string; status?: number } | null): ApiError {
  const message = error?.message ?? "Unknown error";
  if (/fetch failed|network|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|Failed to fetch/i.test(message)) {
    return new ApiError("No internet connection", "offline");
  }
  if (/disconnected by your admin/i.test(message)) return new ApiError(message, "revoked");
  if (/not registered/i.test(message)) return new ApiError(message, "not_registered");
  if (/not active in any company/i.test(message)) return new ApiError(message, "inactive");
  if (/JWT|sign in first|refresh token|not authenticated/i.test(message) || error?.code === "PGRST301") {
    return new ApiError("Your login expired. Please log in again.", "auth");
  }
  return new ApiError(message, "other");
}

export class Api {
  readonly supabase: SupabaseClient;

  constructor(store: SecureStore) {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: store,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }

  async currentUser() {
    const { data } = await this.supabase.auth.getSession();
    return data.session?.user ?? null;
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (/invalid login credentials/i.test(error.message)) throw new ApiError("Wrong email or password.", "auth");
      if (/email not confirmed/i.test(error.message)) {
        throw new ApiError("Confirm your email first (check your inbox).", "auth");
      }
      throw classify(error);
    }
    return data.user;
  }

  async signOut() {
    await this.supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  }

  async registerDevice(installId: string, name: string, os: string, version: string): Promise<DeviceInfo> {
    const { data, error } = await this.supabase.rpc("register_device", {
      p_install_id: installId,
      p_name: name,
      p_os: os,
      p_agent_version: version,
    });
    if (error) throw classify(error);
    return data as DeviceInfo;
  }

  async heartbeat(deviceId: string, sessionId: string | null, state: string | null, app: string | null) {
    const { data, error } = await this.supabase.rpc("heartbeat", {
      p_device_id: deviceId,
      p_session_id: sessionId,
      p_state: state,
      p_current_app: app,
    });
    if (error) throw classify(error);
    return data as HeartbeatResult;
  }

  /** Open tasks assigned to the signed-in worker. */
  async myOpenTasks(): Promise<TaskItem[]> {
    const { data, error } = await this.supabase.rpc("my_open_tasks");
    if (error) throw classify(error);
    return (data ?? []) as TaskItem[];
  }

  /** Assignees may change the status of their own tasks (enforced in the database). */
  async setTaskStatus(taskId: string, status: "todo" | "in_progress" | "review" | "done") {
    const { data, error } = await this.supabase.from("tasks").update({ status }).eq("id", taskId).select("id");
    if (error) throw classify(error);
    if (!data?.length) throw new ApiError("This task is no longer assigned to you.", "other");
  }

  /** Notifications newer than `since` (each person only ever reads their own). */
  async newNotifications(since: string): Promise<AgentNotification[]> {
    const { data, error } = await this.supabase
      .from("notifications")
      .select("id, kind, title, body, link, created_at")
      .gt("created_at", since)
      .is("read_at", null)
      .order("created_at", { ascending: true })
      .limit(10);
    if (error) throw classify(error);
    return (data ?? []) as AgentNotification[];
  }

  async ingest(payload: Payload): Promise<{ server_time: string }> {
    const { data, error } = await this.supabase.rpc("ingest_batch", { p_payload: payload });
    if (error) throw classify(error);
    return data as { server_time: string };
  }
}
