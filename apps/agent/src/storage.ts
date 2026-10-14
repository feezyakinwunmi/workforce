import fs from "node:fs";
import { safeStorage } from "electron";
import { writeFileAtomic } from "./util";

/**
 * Key-value storage for the login session, encrypted with the operating
 * system's keychain (Windows DPAPI / macOS Keychain) through Electron safeStorage.
 * Used as supabase-js `auth.storage`.
 */
export class SecureStore {
  private data: Record<string, string> = {};

  constructor(private file: string) {
    try {
      const raw = fs.readFileSync(file);
      const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString("utf8");
      this.data = JSON.parse(text);
    } catch {
      this.data = {};
    }
  }

  getItem = (key: string): string | null => this.data[key] ?? null;

  setItem = (key: string, value: string) => {
    this.data[key] = value;
    this.save();
  };

  removeItem = (key: string) => {
    delete this.data[key];
    this.save();
  };

  clear() {
    this.data = {};
    this.save();
  }

  private save() {
    const text = JSON.stringify(this.data);
    const out = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, "utf8");
    writeFileAtomic(this.file, out);
  }
}
