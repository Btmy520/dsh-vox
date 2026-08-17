// dsh-vox Host half：语音转录路由。
// 客户端把录音（webm/opus）base64 POST 到 /plugins/dsh-vox/transcribe，这里按
// ~/.config/dsh-vox.json 的 mode 走两条路：
//   mode=local —— ffmpeg 转 16k wav → whisper-cli -l auto（语言自动识别）→ 文本
//   mode=cloud —— 直连 OpenAI 兼容的 /audio/transcriptions（Groq / SiliconFlow 等
//                 免费额度 API），language 留空 = 自动识别
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const TRANSCRIBE_ROUTE = "/plugins/dsh-vox/transcribe";
const MAX_BYTES = 15 * 1024 * 1024;
const TRANSCRIBE_TIMEOUT_MS = 180000;

function configCandidates() {
  const home = process.env.HOME || homedir();
  return [
    join(home, ".config", "dsh-vox.json"),
    join(home, ".dsh", "dsh-vox.json"),
  ];
}

export function loadConfig() {
  for (const path of configCandidates()) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      const mode = raw.mode === "cloud" ? "cloud" : "local";
      if (mode === "local") {
        if (typeof raw.bin === "string" && raw.bin !== "" && typeof raw.model === "string" && raw.model !== "") {
          return {
            mode: "local",
            bin: raw.bin,
            model: raw.model,
            threads: Number.isInteger(raw.threads) && raw.threads > 0 ? raw.threads : 4,
          };
        }
        continue;
      }
      if (typeof raw.baseUrl === "string" && raw.baseUrl !== "" && typeof raw.apiKey === "string" && raw.apiKey !== "") {
        return {
          mode: "cloud",
          baseUrl: raw.baseUrl.replace(/\/+$/, ""),
          apiKey: raw.apiKey,
          model: typeof raw.model === "string" && raw.model !== "" ? raw.model : "whisper-large-v3",
        };
      }
    } catch {
      /* 下一个候选路径 */
    }
  }
  return null;
}

/** ffmpeg 把任意录音转成 whisper 需要的 16kHz 单声道 PCM wav。 */
export function convertToWav(src, dst) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", "-i", src, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", dst]);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString().slice(-2000);
    });
    child.on("error", () => reject(new Error("找不到 ffmpeg，请先安装（Ubuntu/Debian: sudo apt install ffmpeg）")));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("音频转换失败：" + stderr.slice(-300)));
    });
  });
}

/** 本地 whisper-cli 转录；-l auto 让模型自动判断语言。 */
export function transcribeLocal(cfg, wavPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(cfg.bin, [
      "-m", cfg.model,
      "-f", wavPath,
      "-l", "auto",
      "-t", String(cfg.threads),
      "--no-timestamps",
    ]);
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch (e) { /* 已退出 */ }
      reject(new Error("识别超时（" + (TRANSCRIBE_TIMEOUT_MS / 1000) + "s），换更小的模型试试"));
    }, TRANSCRIBE_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString().slice(-2000);
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("找不到 whisper-cli，请检查 ~/.config/dsh-vox.json 里的 bin 路径"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error("whisper 退出码 " + code + "：" + stderr.slice(-300)));
        return;
      }
      const text = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")
        .join(" ");
      resolve(text);
    });
  });
}

/** 云端模式：OpenAI 兼容的音频转录接口（language 留空 = 自动识别）。 */
export async function transcribeCloud(cfg, fileName, base64) {
  const buffer = Buffer.from(base64, "base64");
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "audio/webm" }), fileName || "voice.webm");
  form.append("model", cfg.model);
  const res = await fetch(cfg.baseUrl + "/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: "Bearer " + cfg.apiKey },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("云端识别失败 HTTP " + res.status + "：" + text.slice(0, 200));
  }
  const json = await res.json().catch(() => null);
  if (json === null || typeof json.text !== "string") throw new Error("云端接口返回格式异常");
  return json.text;
}

function send(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

export const inject = ["webServer"];

export function apply(ctx) {
  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: "exact",
      path: TRANSCRIBE_ROUTE,
      handler: async (req, res) => {
        if ((req.method ?? "GET") !== "POST") return send(res, 405, { ok: false, error: "只接受 POST" });

        const cfg = loadConfig();
        if (cfg === null) {
          return send(res, 400, {
            ok: false,
            error: "未配置：请创建 ~/.config/dsh-vox.json（local 模式：{mode,bin,model,threads}；cloud 模式：{mode,baseUrl,apiKey,model}）",
          });
        }

        const chunks = [];
        let size = 0;
        try {
          for await (const chunk of req) {
            size += chunk.length;
            if (size > MAX_BYTES) return send(res, 413, { ok: false, error: "录音超过 15MB 上限（说太久啦，分几段吧）" });
            chunks.push(chunk);
          }
        } catch {
          return send(res, 400, { ok: false, error: "读取请求失败" });
        }

        let parsed;
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          return send(res, 400, { ok: false, error: "请求不是 JSON" });
        }
        if (typeof parsed.data !== "string" || parsed.data === "") {
          return send(res, 400, { ok: false, error: "缺少 data 字段" });
        }

        if (cfg.mode === "cloud") {
          try {
            const text = await transcribeCloud(cfg, typeof parsed.name === "string" ? parsed.name : "voice.webm", parsed.data);
            return send(res, 200, { ok: true, text });
          } catch (err) {
            return send(res, 500, { ok: false, error: err && err.message ? err.message : String(err) });
          }
        }

        // 本地模式：临时目录里转格式 + 转录，用完即删
        const dir = mkdtempSync(join(tmpdir(), "dsh-vox-"));
        const webmPath = join(dir, "voice.webm");
        const wavPath = join(dir, "voice.wav");
        try {
          writeFileSync(webmPath, Buffer.from(parsed.data, "base64"));
          await convertToWav(webmPath, wavPath);
          const text = await transcribeLocal(cfg, wavPath);
          send(res, 200, { ok: true, text });
        } catch (err) {
          send(res, 500, { ok: false, error: err && err.message ? err.message : String(err) });
        } finally {
          try {
            rmSync(dir, { recursive: true, force: true });
          } catch {
            /* 临时目录清理失败不影响结果 */
          }
        }
      },
    });
    return () => {
      dispose();
    };
  }, "dsh-vox: transcribe route");
}
