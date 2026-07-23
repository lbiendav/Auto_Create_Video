// One-off script: re-render the existing composition without re-running TTS.
// Uses already-generated per-scene voice files in <outputDir>/voice/.
//
// Usage: npx tsx rerender.ts <outputDir>

import { readFile, writeFile, copyFile } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { ScriptSchema } from "./src/render/script-schema.js";
import { loadConfig } from "./src/config.js";
import { getDurationSec, concatWithSilence, mixSfxOntoVoice, mixMusicOntoVoice, type SfxMixSpec } from "./src/assets/audio-tools.js";
import { indexSfxLibrary, pickSfxForScene, defaultPlayback } from "./src/assets/sfx-selector.js";
import { pickMusic } from "./src/assets/music-selector.js";
import { existsSync, renameSync, readFileSync } from "node:fs"; // Thêm renameSync an toàn
import { execSync } from "node:child_process";    // Thêm execSync để gọi lệnh ffmpeg
import { composeHtml } from "./src/render/html-composer.js";
import { buildCaptionChunks, type CaptionChunk } from "./src/render/captions.js";
import { renderWithHyperframes } from "./src/render/hyperframes-runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = join(__dirname, "src", "render", "templates");
const SFX_DIR = join(__dirname, "assets", "sfx");
const MUSIC_DIR = join(__dirname, "assets", "music");
const SCENE_GAP_SEC = 0.3;
const OUTRO_HOLD_SEC = 1; // ĐỒNG BỘ: Thiết lập đúng 1 giây chờ sau khi dứt lời thoại thoại giống pipeline

const HYPERFRAMES_CONFIG = {
  $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
  registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
  paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
};

async function main() {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error("Usage: npx tsx rerender.ts <outputDir>");
    process.exit(2);
  }

  const cfg = loadConfig();
  console.log(`Re-rendering: ${outputDir}`);

  // Load script.json
  const raw = JSON.parse(await readFile(join(outputDir, "script.json"), "utf8"));
  if (raw.voice?.voiceId === "${VIETNAMESE_VOICEID}" || raw.voice?.voiceId === "${VOICE_ID}") {
    raw.voice.voiceId = cfg.ttsProvider === "lucylab" ? cfg.lucylabVoiceId! : cfg.elevenlabsVoiceId!;
  }
  const script = ScriptSchema.parse(raw);

  // Probe per-scene durations from existing voice files
  const sceneAudio = await Promise.all(
      script.scenes.map(async (s) => {
        const path = join(outputDir, "voice", `scene-${s.id}.mp3`);
        const dur = await getDurationSec(path);
        console.log(`  scene ${s.id}: ${dur.toFixed(2)}s`);
        return { id: s.id, path, durationSec: dur };
      })
  );

  // Re-concat voice (in case audio-tools fix changed encoding)
  const voiceRawMp3 = join(outputDir, "voice-raw.mp3");
  const voiceMp3 = join(outputDir, "voice.mp3");
  await concatWithSilence(sceneAudio.map((a) => a.path), SCENE_GAP_SEC, voiceRawMp3);

  // Compute scene start times + collect SFX
  let cursor = 0;
  const sceneStarts: Record<string, number> = {};
  for (const a of sceneAudio) {
    sceneStarts[a.id] = cursor;
    cursor += a.durationSec + SCENE_GAP_SEC;
  }
  // Smart SFX selection — same 3-tier logic as pipeline
  const sfxIndex = indexSfxLibrary(SFX_DIR);
  const sfxList: SfxMixSpec[] = [];
  for (const scene of script.scenes) {
    const startSec = sceneStarts[scene.id];
    if (scene.sfx) {
      if (scene.sfx.name === "none") continue;
      const sfxPath = join(SFX_DIR, `${scene.sfx.name}.mp3`);
      if (existsSync(sfxPath)) {
        sfxList.push({ path: sfxPath, startSec: startSec + scene.sfx.startOffsetSec, volume: scene.sfx.volume });
        console.log(`  scene ${scene.id}: SFX override -> ${scene.sfx.name}`);
      }
      continue;
    }
    const picked = pickSfxForScene({
      voiceText: scene.voiceText,
      templateName: scene.templateData.template,
      sceneId: scene.id,
      index: sfxIndex,
    });
    if (!picked) continue;
    const sfxPath = join(SFX_DIR, picked.relPath);
    const playback = defaultPlayback(picked);
    sfxList.push({ path: sfxPath, startSec: startSec + playback.offsetSec, volume: playback.volume });
    const why = picked.source === "semantic" ? `semantic "${picked.matchedKeyword}"` : picked.source;
    console.log(`  scene ${scene.id}: SFX -> ${picked.relPath} (${why})`);
  }
  console.log(`mixing ${sfxList.length} SFX into voice.mp3`);
  await mixSfxOntoVoice(voiceRawMp3, sfxList, voiceMp3);

  // ─── ĐỒNG BỘ: SỬA LỖI TỰ ĐỘNG XÓA KHOẢNG LẶNG KHI RERENDER ───
  try {
    const voiceRawClean = join(outputDir, "voice-raw-clean.mp3");
    execSync(`ffmpeg -y -i "${voiceRawMp3}" -af "silenceremove=start_periods=0:stop_periods=-1:stop_duration=0.3:stop_threshold=-45dB" "${voiceRawClean}"`, { stdio: "ignore" });

    const trueVoiceDur = await getDurationSec(voiceRawClean);
    const targetDuration = trueVoiceDur + OUTRO_HOLD_SEC;

    console.log("  [Optimize] True voice duration detected: " + trueVoiceDur.toFixed(2) + "s");
    console.log("  [Optimize] Clipping voice.mp3 safely at: " + targetDuration.toFixed(2) + "s");

    const voiceMp3Clipped = join(outputDir, "voice-clipped.mp3");
    execSync(`ffmpeg -y -i "${voiceMp3}" -t ${targetDuration} "${voiceMp3Clipped}"`, { stdio: "ignore" });

    renameSync(voiceMp3Clipped, voiceMp3);
    renameSync(voiceRawClean, voiceRawMp3);

    let precedingDuration = 0;
    for (let i = 0; i < sceneAudio.length - 1; i++) {
      precedingDuration += sceneAudio[i].durationSec + SCENE_GAP_SEC;
    }
    const lastIndex = sceneAudio.length - 1;
    if (lastIndex >= 0) {
      const correctedLastDur = trueVoiceDur - precedingDuration;
      if (correctedLastDur > 0) {
        sceneAudio[lastIndex].durationSec = correctedLastDur;
      }
    }
  } catch (err) {
    console.warn("  [Optimize] Failed to auto-clip audio stream: " + err);
  }
  // ───────────────────────────────────────────────────────────

  // Music bed (same logic as pipeline)
  if (cfg.music.enabled && script.music?.name !== "none") {
    const pick = pickMusic({
      musicDir: MUSIC_DIR,
      seed: script.metadata.title,
      explicitName: script.music?.name,
      explicitFile: cfg.music.file,
    });
    if (pick) {
      const vol = script.music?.volume ?? cfg.music.volume;
      const withMusic = join(outputDir, "voice-music.mp3");
      await mixMusicOntoVoice(voiceMp3, { path: pick.path, volume: vol }, withMusic);
      renameSync(withMusic, voiceMp3);
      console.log(`music bed: ${pick.fileName} @ volume ${vol}`);
    } else {
      console.log("music bed: no tracks in assets/music — skipped");
    }
  }

  const totalDur = await getDurationSec(voiceMp3);
  console.log(`voice.mp3 total: ${totalDur.toFixed(2)}s`);

  // Determine bg image + pre-blurred ambient
  const bgImagePath = join(outputDir, "images", "bg.jpg");
  const bgImageRelPath = existsSync(bgImagePath) ? "images/bg.jpg" : null;
  let ambientImageRelPath: string | null = null;
  if (bgImageRelPath) {
    try {
      const blurPath = join(outputDir, "images", "bg-blur.jpg");
      execSync(
        `ffmpeg -y -i "${bgImagePath}" -vf "scale=540:-2,gblur=sigma=24,eq=brightness=-0.08:saturation=1.3" -q:v 4 "${blurPath}"`,
        { stdio: "ignore" },
      );
      ambientImageRelPath = "images/bg-blur.jpg";
    } catch {
      console.warn("ambient blur failed — continuing without ambient image");
    }
  }
  console.log(`bgImage: ${bgImageRelPath ?? "(none — gradient fallback)"}`);

  // TikTok avatar — find bundled (jpg/jpeg/png/webp) and copy to output dir
  let bundledAvatar: string | null = null;
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const p = join(__dirname, "assets", `avatar.${ext}`);
    if (existsSync(p)) { bundledAvatar = p; break; }
  }
  if (!bundledAvatar) {
    throw new Error("No bundled avatar found. Place an image at assets/avatar.{jpg,png,webp}");
  }
  const ttAvatarExt = bundledAvatar.split(".").pop()!.toLowerCase();
  const ttAvatarFile = `tiktok-avatar.${ttAvatarExt}`;
  const ttAvatarOut = join(outputDir, ttAvatarFile);
  // Always re-copy in case bundled was updated
  await copyFile(bundledAvatar, ttAvatarOut);

  // Karaoke captions: per-scene word timelines (SRT from TTS when available)
  const captionsByScene: Record<string, CaptionChunk[]> = {};
  for (const scene of script.scenes) {
    const audio = sceneAudio.find((a) => a.id === scene.id);
    if (!audio) continue;
    const srtPath = join(outputDir, "voice", `scene-${scene.id}.srt`);
    const srtText = existsSync(srtPath) ? readFileSync(srtPath, "utf8") : null;
    captionsByScene[scene.id] = buildCaptionChunks({
      voiceText: scene.voiceText,
      audioDurationSec: audio.durationSec,
      srtText,
    });
  }

  // Compose HTML
  const html = composeHtml({
    script,
    sceneAudio: sceneAudio.map((a) => ({ id: a.id, durationSec: a.durationSec })),
    gapSec: SCENE_GAP_SEC,
    bgImageRelPath,
    audioRelPath: "voice.mp3",
    tiktok: cfg.tiktok,
    tiktokAvatarRelPath: ttAvatarFile,
    outroHoldSec: OUTRO_HOLD_SEC, // ĐÃ ĐỒNG BỘ: Sử dụng biến động thay vì số 3 hardcode
    ambientImageRelPath,
    captionsByScene,
  });
  await writeFile(join(outputDir, "index.html"), html);
  await writeFile(join(outputDir, "hyperframes.json"), JSON.stringify(HYPERFRAMES_CONFIG, null, 2));
  await writeFile(join(outputDir, "meta.json"), JSON.stringify({
    id: basename(outputDir),
    name: script.metadata.title,
    createdAt: new Date().toISOString(),
  }, null, 2));
  await copyFile(join(TPL_DIR, "styles.css"),    join(outputDir, "styles.css"));
  await copyFile(join(TPL_DIR, "animations.js"), join(outputDir, "animations.js"));

  // Render
  const videoPath = join(outputDir, "video.mp4");
  await renderWithHyperframes({ compositionDir: outputDir, outputPath: videoPath });
  console.log(`\nDone: ${videoPath}`);
}

main().catch((e) => { console.error("Re-render failed:", e); process.exit(1); });