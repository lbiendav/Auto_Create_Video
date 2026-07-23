/**
 * Music bed selector — picks a background track from assets/music.
 *
 * Selection is DETERMINISTIC by hashing the video title: the same script
 * always gets the same track (idempotent re-renders), different videos
 * rotate through the library.
 *
 * The library is user-supplied (royalty-free/CC0 tracks). If the folder is
 * empty or missing, the pipeline simply skips the music bed.
 */
import { readdirSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const MUSIC_EXTS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);

export interface MusicPick {
  /** Absolute path to the chosen file */
  path: string;
  /** File name (for logging) */
  fileName: string;
}

/** FNV-1a — stable across runs (same approach as the SFX selector) */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface PickMusicArgs {
  musicDir: string;
  /** Seed for deterministic rotation — use the video title */
  seed: string;
  /** Explicit file name from script.json (without extension, or with) */
  explicitName?: string;
  /** Absolute path override from env (MUSIC_FILE) — wins over everything */
  explicitFile?: string;
}

export function pickMusic(args: PickMusicArgs): MusicPick | null {
  // Env override — absolute path to any file
  if (args.explicitFile) {
    if (existsSync(args.explicitFile)) {
      return { path: args.explicitFile, fileName: args.explicitFile.split("/").pop()! };
    }
    return null;
  }

  if (!existsSync(args.musicDir) || !statSync(args.musicDir).isDirectory()) return null;

  // Explicit name from script.json — try as-is then with known extensions
  if (args.explicitName) {
    const candidates = MUSIC_EXTS.has(extname(args.explicitName).toLowerCase())
      ? [args.explicitName]
      : [...MUSIC_EXTS].map((ext) => `${args.explicitName}${ext}`);
    for (const c of candidates) {
      const p = join(args.musicDir, c);
      if (existsSync(p)) return { path: p, fileName: c };
    }
    return null;
  }

  const files = readdirSync(args.musicDir)
    .filter((f) => MUSIC_EXTS.has(extname(f).toLowerCase()))
    .sort();
  if (files.length === 0) return null;

  const chosen = files[fnv1a(args.seed) % files.length];
  return { path: join(args.musicDir, chosen), fileName: chosen };
}
