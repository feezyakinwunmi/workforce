/** Public GitHub repo where the desktop installers are published (see .github/workflows/release-agent.yml). */
export const RELEASES_REPO = process.env.RELEASES_REPO ?? "feezyakinwunmi/workforce-releases";

export type DesktopRelease = {
  version: string;
  publishedAt: string;
  windows: { url: string; sizeMb: number } | null;
  mac: { url: string; sizeMb: number } | null;
};

type GitHubAsset = { name: string; browser_download_url: string; size: number };
type GitHubRelease = { tag_name: string; published_at: string; draft: boolean; assets: GitHubAsset[] };

/** Latest published installer, cached for 10 minutes. Null when nothing is published yet. */
export async function getLatestRelease(): Promise<DesktopRelease | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "workforce-dashboard" },
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const release = (await res.json()) as GitHubRelease;
    if (release.draft) return null;

    const pick = (test: (name: string) => boolean) => {
      const asset = release.assets.find((a) => test(a.name.toLowerCase()));
      return asset ? { url: asset.browser_download_url, sizeMb: Math.round(asset.size / 1_048_576) } : null;
    };

    return {
      version: release.tag_name.replace(/^v/, ""),
      publishedAt: release.published_at,
      windows: pick((n) => n.endsWith(".exe")),
      mac: pick((n) => n.endsWith(".dmg")),
    };
  } catch {
    return null;
  }
}
