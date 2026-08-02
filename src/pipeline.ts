import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import { ScriptSchema, type Script } from "./render/script-schema.js";
import { loadConfig } from "./config.js";
import { createTtsClient } from "./tts/tts-client.js";
import { fetchImage } from "./assets/image-fetcher.js";
import { getDurationSec, concatWithSilence, mixSfxOntoVoice, mixMusicOntoVoice, type SfxMixSpec } from "./assets/audio-tools.js";
import { indexSfxLibrary, pickSfxForScene, defaultPlayback } from "./assets/sfx-selector.js";
import { pickMusic } from "./assets/music-selector.js";
import { existsSync, readFileSync } from "node:fs";
import { composeHtml } from "./render/html-composer.js";
import { composeHtmlMaiCrypto } from "./render/maicrypto-composer.js";
import { resolveSceneImages, resolveSceneCellImages } from "./assets/scene-images.js";
import { resolveSceneVideos } from "./assets/scene-videos.js";
import { buildCaptionChunks, type CaptionChunk } from "./render/captions.js";
import { renderWithHyperframes } from "./render/hyperframes-runner.js";
import { log } from "./utils/logger.js";
import { execSync } from "node:child_process"; // Tích hợp bộ gọi lệnh hệ thống
import { renameSync } from "node:fs";            // Tích hợp bộ đổi tên file nhanh

const TOTAL_STEPS = 8;
const DURATION_MIN_SEC = 48;
const DURATION_MAX_SEC = 72;
const SCENE_GAP_SEC = 0.3;
/**
 * Extra seconds added to the outro scene visual duration AFTER the voice ends.
 * Gives the TikTok follow card time to be read by the viewer (otherwise the
 * video ends a few hundred ms after the card slides up + click animation).
 * Audio stays silent during this hold; visual stays on screen.
 */
/**
 * Giọng đọc của scene outro dài quá ngần này (giây) thì cảnh báo: thẻ outro là
 * hình tĩnh, nói càng lâu thì khán giả càng phải nhìn logo đứng yên.
 */
const OUTRO_MAX_VOICE_SEC = 6;
const OUTRO_HOLD_SEC = 1; // ĐÃ CHỈNH: Đặt đúng 1 giây chờ sau khi dứt lời thoại thoại theo yêu cầu

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = join(__dirname, "render", "templates");
const TPL_DIR_MAI = join(__dirname, "render", "templates", "maicrypto");
/** Path to the SFX library (relative to project root) */
const SFX_DIR = join(__dirname, "..", "assets", "sfx");
/** Path to the music-bed library (relative to project root) */
const MUSIC_DIR = join(__dirname, "..", "assets", "music");

const HYPERFRAMES_CONFIG = {
  $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
  registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
  paths: {
    blocks: "compositions",
    components: "compositions/components",
    assets: "assets",
  },
};

export async function runPipeline(scriptPath: string): Promise<void> {
  const cfg = loadConfig();
  const outputDir = dirname(scriptPath);
  log.info(`Output directory: ${outputDir}`);

  // STEP 1
  log.step(1, TOTAL_STEPS, `Load env + validate script.json (TTS provider: ${cfg.ttsProvider})`);
  const raw = JSON.parse(await readFile(scriptPath, "utf8"));
  // Substitute env placeholder before validation (works for both providers)
  if (raw.voice?.voiceId === "${VIETNAMESE_VOICEID}" || raw.voice?.voiceId === "${VOICE_ID}") {
    raw.voice.voiceId = cfg.ttsProvider === "lucylab" ? cfg.lucylabVoiceId! : cfg.elevenlabsVoiceId!;
  }
  const script: Script = ScriptSchema.parse(raw);

  // STEP 2
  log.step(2, TOTAL_STEPS, "Write script.txt for CapCut");
  const fullText = script.scenes.map((s) => s.voiceText).join("\n\n");
  await writeFile(join(outputDir, "script.txt"), fullText);

  // STEP 3 + 4 in parallel
  log.step(3, TOTAL_STEPS, "Fetch og:image (parallel) + Step 4 TTS");
  const imgPath = join(outputDir, "images", "bg.jpg");
  const imgPromise = fetchImage(script.metadata.source.image, imgPath);

  // STEP 4
  const ttsClient = createTtsClient(cfg);
  // Concurrency: LucyLab requires 1 (only 1 concurrent export per key);
  // ElevenLabs supports parallel calls but we keep 1 by default to be polite.
  const limit = pLimit(cfg.ttsConcurrency);
  const voiceDir = join(outputDir, "voice");
  await mkdir(voiceDir, { recursive: true });

  const sceneAudioPromises = script.scenes.map((scene) =>
      limit(async () => {
        const out = join(voiceDir, `scene-${scene.id}.mp3`);
        const srtOut = join(voiceDir, `scene-${scene.id}.srt`);

        // IDEMPOTENT: skip TTS if voice file already exists.
        // To force re-TTS for a scene, delete its mp3 file before running.
        // This saves API quota when only some scenes' voiceText changed.
        if (existsSync(out)) {
          const dur = await getDurationSec(out);
          log.info(`  scene ${scene.id}: REUSE existing mp3 (${dur.toFixed(2)}s) — delete to force re-TTS`);
          return { id: scene.id, path: out, durationSec: dur };
        }

        log.info(`  TTS scene ${scene.id} (${scene.voiceText.length} chars)...`);
        await ttsClient.generate(scene.voiceText, out, srtOut);
        const dur = await getDurationSec(out);
        log.info(`  scene ${scene.id}: ${dur.toFixed(2)}s`);
        return { id: scene.id, path: out, durationSec: dur };
      }),
  );

  const [imgResult, sceneAudio] = await Promise.all([
    imgPromise,
    Promise.all(sceneAudioPromises),
  ]);

  let bgImageRelPath: string | null = null;
  let ambientImageRelPath: string | null = null;
  if (imgResult.success) {
    bgImageRelPath = "images/bg.jpg";
    // Pre-blur ambient background with ffmpeg (blur in CSS per-frame is slow)
    try {
      const blurPath = join(outputDir, "images", "bg-blur.jpg");
      execSync(
        `ffmpeg -y -i "${imgPath}" -vf "scale=540:-2,gblur=sigma=24,eq=brightness=-0.08:saturation=1.3" -q:v 4 "${blurPath}"`,
        { stdio: "ignore" },
      );
      ambientImageRelPath = "images/bg-blur.jpg";
    } catch (err) {
      log.warn(`  ambient blur failed (${err}) — continuing without ambient image`);
    }
  } else {
    log.warn(`Background image fetch failed: ${imgResult.reason} → using gradient fallback`);
  }

  // STEP 5
  log.step(5, TOTAL_STEPS, "Concat voice scenes + mix SFX layer");
  const voiceRawMp3 = join(outputDir, "voice-raw.mp3");
  const voiceMp3 = join(outputDir, "voice.mp3");
  await concatWithSilence(sceneAudio.map((a) => a.path), SCENE_GAP_SEC, voiceRawMp3);

  // Compute scene start times (cumulative voice durations + gaps)
  let cursor = 0;
  const sceneStarts: Record<string, number> = {};
  for (const a of sceneAudio) {
    sceneStarts[a.id] = cursor;
    cursor += a.durationSec + SCENE_GAP_SEC;
  }

  // Build SFX mix list using smart 3-tier selector
  const sfxIndex = indexSfxLibrary(SFX_DIR);
  const indexCats = Object.keys(sfxIndex).length;
  const indexFiles = Object.values(sfxIndex).reduce((s, a) => s + a.length, 0);
  log.info(`  SFX library: ${indexFiles} files in ${indexCats} categories`);

  const sfxList: SfxMixSpec[] = [];
  for (const scene of script.scenes) {
    const startSec = sceneStarts[scene.id];

    // Tier 1: explicit override in script.json
    if (scene.sfx) {
      if (scene.sfx.name === "none") {
        log.info(`  scene ${scene.id}: SFX disabled (explicit "none")`);
        continue;
      }
      const sfxPath = join(SFX_DIR, `${scene.sfx.name}.mp3`);
      if (existsSync(sfxPath)) {
        sfxList.push({ path: sfxPath, startSec: startSec + scene.sfx.startOffsetSec, volume: scene.sfx.volume });
        log.info(`  scene ${scene.id}: SFX override -> ${scene.sfx.name}.mp3`);
      } else {
        log.warn(`  scene ${scene.id}: explicit SFX not found, skipping: ${scene.sfx.name}.mp3`);
      }
      continue;
    }

    // Tier 2/3: smart selection by content + template
    const picked = pickSfxForScene({
      voiceText: scene.voiceText,
      templateName: scene.templateData.template,
      sceneId: scene.id,
      index: sfxIndex,
    });
    if (!picked) {
      log.warn(`  scene ${scene.id}: no SFX available (empty library?)`);
      continue;
    }

    const sfxPath = join(SFX_DIR, picked.relPath);
    const playback = defaultPlayback(picked);
    sfxList.push({ path: sfxPath, startSec: startSec + playback.offsetSec, volume: playback.volume });

    const why = picked.source === "semantic"
        ? `semantic match "${picked.matchedKeyword}"`
        : picked.source;
    log.info(`  scene ${scene.id}: SFX -> ${picked.relPath} (${why})`);
  }
  log.info(`  mixing ${sfxList.length} SFX into voice.mp3`);
  await mixSfxOntoVoice(voiceRawMp3, sfxList, voiceMp3);

  // ─── ĐOẠN MÃ SỬA LỖI TỰ ĐỘNG XÓA KHOẢNG LẶNG VÀ ÉP CẮT ĐUÔI VIDEO TỰ ĐỘNG ───
  try {
    const voiceRawClean = join(outputDir, "voice-raw-clean.mp3");
    // ĐÃ SỬA CHUẨN: Nới rộng stop_duration từ 0.3 lên 1.5 để không cưa nhầm khoảng nghỉ ngắt quãng của AI voice ở cảnh Outro
    execSync(`ffmpeg -y -i "${voiceRawMp3}" -af "silenceremove=start_periods=0:stop_periods=-1:stop_duration=1.5:stop_threshold=-45dB" "${voiceRawClean}"`, { stdio: "ignore" });

    const trueVoiceDur = await getDurationSec(voiceRawClean);
    const targetDuration = trueVoiceDur + OUTRO_HOLD_SEC; // Đúng bằng thời gian nói thật + 1 giây chờ

    log.info(`  [Tối ưu] Phát hiện giọng đọc thực tế dứt âm tại giây thứ: ${trueVoiceDur.toFixed(2)}s.`);
    log.info(`  [Tối ưu] Ép cưa file voice.mp3 dừng chuẩn đét tại giây thứ: ${targetDuration.toFixed(2)}s.`);

    const voiceMp3Clipped = join(outputDir, "voice-clipped.mp3");
    execSync(`ffmpeg -y -i "${voiceMp3}" -t ${targetDuration} "${voiceMp3Clipped}"`, { stdio: "ignore" });

    renameSync(voiceMp3Clipped, voiceMp3);
    renameSync(voiceRawClean, voiceRawMp3);

    // Tính toán lại mảng sceneAudio để HTML Composer đồng bộ trục thời gian hiển thị khớp 100% với file nhạc mới cưa
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
    log.warn(`  [Tối ưu] Không thể ép cắt âm thanh tự động: ${err}`);
  }
  // ───────────────────────────────────────────────────────────────────────────

  // STEP 5c — Music bed (looped, ducked under voice via sidechain compression)
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
      log.info(`  music bed: ${pick.fileName} @ volume ${vol} (auto-duck under voice)`);
    } else {
      log.info("  music bed: no tracks in assets/music — skipped (drop royalty-free mp3 there to enable)");
    }
  }

  // Thẻ outro là hình TĨNH. Thời lượng scene = đúng độ dài giọng đọc của nó,
  // nên nếu nhét nội dung tin vào voiceText của outro thì khán giả phải nhìn
  // logo đứng yên suốt lúc lời thoại còn đang chạy — cảm giác như video đã kết
  // thúc mà vẫn còn người nói. Outro chỉ nên chứa câu CTA.
  const outroAudio = sceneAudio.find((a) => script.scenes.find((s) => s.id === a.id)?.type === "outro");
  if (outroAudio && outroAudio.durationSec > OUTRO_MAX_VOICE_SEC) {
    const outroScene = script.scenes.find((s) => s.type === "outro")!;
    log.warn(
      `Outro nói ${outroAudio.durationSec.toFixed(1)}s (ngưỡng ${OUTRO_MAX_VOICE_SEC}s) — ` +
        `thẻ thương hiệu sẽ đứng yên ngần ấy giây trong khi giọng vẫn đọc.\n` +
        `      Chuyển phần nội dung tin sang một scene body có ảnh/clip, để outro chỉ còn câu kêu gọi theo dõi.\n` +
        `      voiceText hiện tại: "${outroScene.voiceText.slice(0, 70)}${outroScene.voiceText.length > 70 ? "…" : ""}"`,
    );
  }

  const totalAudioSec = await getDurationSec(voiceMp3);
  log.info(`  voice.mp3 total: ${totalAudioSec.toFixed(2)}s`);
  if (totalAudioSec < DURATION_MIN_SEC || totalAudioSec > DURATION_MAX_SEC) {
    log.warn(`Total duration ${totalAudioSec.toFixed(1)}s outside [${DURATION_MIN_SEC}, ${DURATION_MAX_SEC}]s tolerance — proceeding anyway`);
  }

  // STEP 6 — Compose HTML + write hyperframes project files
  log.step(6, TOTAL_STEPS, "Compose HTML + project files");

  // Resolve TikTok avatar — download URL if provided, else copy bundled default
  // Bundled avatar can be jpg/jpeg/png/webp — pick whichever exists
  const findBundledAvatar = (): string => {
    const baseDir = join(__dirname, "..", "assets");
    for (const ext of ["jpg", "jpeg", "png", "webp"]) {
      const p = join(baseDir, `avatar.${ext}`);
      if (existsSync(p)) return p;
    }
    throw new Error(`No bundled avatar found. Place an image at assets/avatar.{jpg,png,webp}`);
  };
  const bundledAvatar = findBundledAvatar();
  const ttAvatarExt = bundledAvatar.split(".").pop()!.toLowerCase();
  const ttAvatarFile = `tiktok-avatar.${ttAvatarExt}`;
  const ttAvatarOut = join(outputDir, ttAvatarFile);
  if (cfg.theme === "broadcast" && cfg.tiktok.avatarUrl) {
    const r = await fetchImage(cfg.tiktok.avatarUrl, ttAvatarOut);
    if (!r.success) {
      log.warn(`TikTok avatar download failed: ${r.reason} → falling back to bundled default`);
      await copyFile(bundledAvatar, ttAvatarOut);
    }
  } else {
    await copyFile(bundledAvatar, ttAvatarOut);
  }

  // Karaoke captions: per-scene word timelines (SRT from TTS when available)
  const captionsByScene: Record<string, CaptionChunk[]> = {};
  for (const scene of script.scenes) {
    const audio = sceneAudio.find((a) => a.id === scene.id);
    if (!audio) continue;
    const srtPath = join(voiceDir, `scene-${scene.id}.srt`);
    const srtText = existsSync(srtPath) ? readFileSync(srtPath, "utf8") : null;
    captionsByScene[scene.id] = buildCaptionChunks({
      voiceText: scene.voiceText,
      audioDurationSec: audio.durationSec,
      srtText,
    });
  }
  const srtCount = script.scenes.filter((s) => existsSync(join(voiceDir, `scene-${s.id}.srt`))).length;
  log.info(`  captions: ${srtCount}/${script.scenes.length} scenes with SRT timing (rest estimated)`);

  // ── STEP 6b: theme-aware compose ──────────────────────────────────────────
  const slug = basename(outputDir);
  let html: string;
  let themeTplDir = TPL_DIR;

  if (cfg.theme === "maicrypto") {
    themeTplDir = TPL_DIR_MAI;

    // Copy the brand (sun) logo next to index.html
    const findBrandLogo = (file: string): string => {
      const baseDir = join(__dirname, "..", "assets");
      if (existsSync(join(baseDir, file))) return join(baseDir, file);
      const stem = file.replace(/\.[^.]+$/, "");
      for (const ext of ["png", "jpg", "jpeg", "webp", "svg"]) {
        const p = join(baseDir, `${stem}.${ext}`);
        if (existsSync(p)) return p;
      }
      throw new Error(`Brand logo not found: assets/${file}`);
    };
    const logoSrc = findBrandLogo(cfg.brand.logoFile);
    const logoExt = logoSrc.split(".").pop()!.toLowerCase();
    const logoRelPath = `logo.${logoExt}`;
    await copyFile(logoSrc, join(outputDir, logoRelPath));

    // AN TOÀN: scene khai báo `video` nhưng không có `image` sẽ rơi vào nền nến
    // trống trơn nếu tải clip thất bại. Tự sinh ảnh dự phòng từ chính từ khoá clip.
    for (const scene of script.scenes) {
      if (scene.video && !scene.image) {
        const q = scene.video.query ?? scene.templateData.template;
        scene.image = { query: q, fit: "cover", kenBurns: "zoom-in" };
        log.info(`  scene ${scene.id}: thêm ảnh dự phòng cho beat video ("${q}")`);
      }
    }

    // Resolve per-scene images (URL / local path / AI-generated) + pre-blur fills
    const sceneImages = await resolveSceneImages(script, outputDir, cfg.imageGen, cfg.imageSearch);
    // Extra cells for multi-image templates (hook-collage)
    const sceneCollageImages = await resolveSceneCellImages(script, outputDir, cfg.imageGen, cfg.imageSearch);

    // On-screen length of every scene — must match the composer's own timing so
    // each normalised clip is exactly as long as the beat that shows it.
    const sceneDurations: Record<string, number> = {};
    for (const scene of script.scenes) {
      const a = sceneAudio.find((x) => x.id === scene.id);
      if (!a) continue;
      sceneDurations[scene.id] = a.durationSec + SCENE_GAP_SEC + (scene.type === "outro" ? OUTRO_HOLD_SEC : 0);
    }

    // Per-scene video clips: direct src, or searched from related platforms
    const sceneVideos = await resolveSceneVideos(
      script,
      outputDir,
      sceneDurations,
      cfg.videoSearch,
      cfg.render.fps,
    );

    const sourceName = script.metadata.source.name ?? script.metadata.source.domain;

    html = composeHtmlMaiCrypto({
      script,
      sceneAudio: sceneAudio.map((a) => ({ id: a.id, durationSec: a.durationSec })),
      gapSec: SCENE_GAP_SEC,
      audioRelPath: "voice.mp3",
      brand: cfg.brand,
      sourceName,
      logoRelPath,
      outroHoldSec: OUTRO_HOLD_SEC,
      sceneImages,
      sceneCollageImages,
      sceneVideos,
    });
  } else {
    html = composeHtml({
      script,
      sceneAudio: sceneAudio.map((a) => ({ id: a.id, durationSec: a.durationSec })),
      gapSec: SCENE_GAP_SEC,
      bgImageRelPath,
      audioRelPath: "voice.mp3",
      tiktok: cfg.tiktok,
      tiktokAvatarRelPath: ttAvatarFile,
      outroHoldSec: OUTRO_HOLD_SEC,
      ambientImageRelPath,
      captionsByScene,
    });
  }

  // hyperframes expects: index.html, hyperframes.json, meta.json in DIR
  await writeFile(join(outputDir, "index.html"), html);
  await writeFile(join(outputDir, "hyperframes.json"), JSON.stringify(HYPERFRAMES_CONFIG, null, 2));
  await writeFile(join(outputDir, "meta.json"), JSON.stringify({
    id: slug,
    name: script.metadata.title,
    createdAt: new Date().toISOString(),
  }, null, 2));

  // Copy the ACTIVE theme's templates next to index.html so relative paths resolve
  await copyFile(join(themeTplDir, "styles.css"),    join(outputDir, "styles.css"));
  await copyFile(join(themeTplDir, "animations.js"), join(outputDir, "animations.js"));

  // STEP 7
  log.step(7, TOTAL_STEPS, "Render with hyperframes");
  const videoPath = join(outputDir, "video.mp4");
  await renderWithHyperframes({
    compositionDir: outputDir,
    outputPath: videoPath,
    fps: cfg.render.fps,
    quality: cfg.render.quality,
    videoBitrate: cfg.render.videoBitrate,
    crf: cfg.render.crf,
    gpu: cfg.render.gpu,
    minMbps: cfg.render.minMbps,
  });

  // STEP 8
  log.step(8, TOTAL_STEPS, "Done");
  console.log("\n=== Result ===");
  console.log(`Video:  ${videoPath}`);
  console.log(`Audio:  ${voiceMp3}  (cho CapCut)`);
  console.log(`Script: ${join(outputDir, "script.txt")}  (cho CapCut auto-caption)`);
  console.log(`Tong thoi luong: ${totalAudioSec.toFixed(2)}s`);
}