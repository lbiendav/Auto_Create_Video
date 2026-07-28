import axios from "axios";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface FetchResult {
  success: boolean;
  path?: string;
  reason?: string;
}

export async function fetchImage(url: string | null, outPath: string, timeoutMs = 30000): Promise<FetchResult> {
  if (!url) return { success: false, reason: "no url provided (null)" };

  try {
    const resp = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: timeoutMs,
      validateStatus: (s) => s < 400,
    });

    const ct = String(resp.headers["content-type"] ?? "");
    if (!ct.startsWith("image/")) {
      return { success: false, reason: `non-image content-type: ${ct}` };
    }

    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, Buffer.from(resp.data));
    return { success: true, path: outPath };
  } catch (e: any) {
    const status = e.response?.status;
    return { success: false, reason: status ? `http ${status}` : String(e.message ?? e) };
  }
}
