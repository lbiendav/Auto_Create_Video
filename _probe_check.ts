import { loadConfig } from "./src/config.js";
import { verifyForTiktok } from "./src/render/hyperframes-runner.js";
console.log("render cfg:", JSON.stringify(loadConfig().render));
console.log("--- verify a real 20M 1080x1920 h264 file ---");
verifyForTiktok("/tmp/probe-test.mp4", 10);
console.log("--- verify a deliberately low-bitrate file (should warn) ---");
verifyForTiktok("/tmp/probe-bad.mp4", 10);
