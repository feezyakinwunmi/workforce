import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type ActiveWindow = { app: string; title: string };

/**
 * Reads the app and window title in front, without native modules
 * (nothing to compile on the worker's computer).
 *
 * Windows: one long-running hidden PowerShell process answers each request.
 * macOS:   AppleScript via osascript (app name only for now).
 * Others:  not supported yet (returns null).
 */
export class ActiveWindowReader {
  private ps: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private waiting: Array<(w: ActiveWindow | null) => void> = [];

  constructor(private scriptDir: string) {}

  async get(): Promise<ActiveWindow | null> {
    if (process.platform === "win32") return this.getWindows();
    if (process.platform === "darwin") return this.getMac();
    return null;
  }

  stop() {
    this.ps?.kill();
    this.ps = null;
  }

  // ---------------- Windows ----------------
  private startPowerShell() {
    const file = path.join(this.scriptDir, "active-window.ps1");
    fs.mkdirSync(this.scriptDir, { recursive: true });
    fs.writeFileSync(file, POWERSHELL_SCRIPT, "utf8");

    const ps = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file],
      { windowsHide: true },
    );
    ps.stdout.setEncoding("utf8");
    ps.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      let nl: number;
      while ((nl = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        if (!line) continue;
        const resolve = this.waiting.shift();
        if (!resolve) continue;
        try {
          const parsed = JSON.parse(line) as ActiveWindow;
          resolve(parsed.app ? { app: String(parsed.app), title: String(parsed.title ?? "") } : null);
        } catch {
          resolve(null);
        }
      }
    });
    ps.on("exit", () => {
      this.ps = null;
      this.waiting.splice(0).forEach((r) => r(null));
    });
    ps.on("error", () => {
      this.ps = null;
    });
    this.ps = ps;
  }

  private getWindows(): Promise<ActiveWindow | null> {
    if (!this.ps) this.startPowerShell();
    const ps = this.ps;
    if (!ps) return Promise.resolve(null);

    return new Promise((resolve) => {
      let done = false;
      const finish = (w: ActiveWindow | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(w);
      };
      const timer = setTimeout(() => {
        // PowerShell hung: drop this request and restart it next time.
        const i = this.waiting.indexOf(finish);
        if (i >= 0) this.waiting.splice(i, 1);
        this.stop();
        finish(null);
      }, 4000);
      this.waiting.push(finish);
      ps.stdin.write("next\n");
    });
  }

  // ---------------- macOS ----------------
  private getMac(): Promise<ActiveWindow | null> {
    const script =
      'tell application "System Events" to get name of first application process whose frontmost is true';
    return new Promise((resolve) => {
      execFile("osascript", ["-e", script], { timeout: 3000 }, (err, stdout) => {
        if (err) return resolve(null);
        const app = stdout.trim();
        resolve(app ? { app, title: "" } : null);
      });
    });
  }
}

const POWERSHELL_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ForegroundWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$names = @{}
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $app = ''
  $title = ''
  try {
    $h = [ForegroundWin]::GetForegroundWindow()
    $sb = New-Object System.Text.StringBuilder 512
    [void][ForegroundWin]::GetWindowText($h, $sb, 512)
    $title = $sb.ToString()
    [uint32]$procId = 0
    [void][ForegroundWin]::GetWindowThreadProcessId($h, [ref]$procId)
    if ($names.ContainsKey($procId)) {
      $app = $names[$procId]
    } else {
      $p = Get-Process -Id $procId
      if ($p) {
        try { $app = $p.MainModule.FileVersionInfo.FileDescription } catch { $app = '' }
        if (-not $app) { $app = $p.ProcessName }
        if ($names.Count -gt 500) { $names.Clear() }
        $names[$procId] = $app
      }
    }
  } catch { }
  $json = (@{ app = $app; title = $title } | ConvertTo-Json -Compress)
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}
`;
