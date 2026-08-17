# 🎙️ dsh-vox — Local Whisper voice input for DeepSeek Harness

> Talk at the input box. A model running on *your own machine* transcribes whatever language you throw at it,
> and the words just walk into the draft by themselves. Your audio never leaves home.

<p align="right">
  <a href="./README.md"><img src="https://img.shields.io/badge/点我切-中文-red" alt="切换到中文"/></a>
  <img src="https://img.shields.io/badge/lang-English-blue" alt="Current language"/>
</p>

[![version](https://img.shields.io/badge/version-0.3.0-4d6bfe)](./package.json)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![platform](https://img.shields.io/badge/platform-DeepSeek%20Harness%20Web-4d6bfe)]()
[![built with](https://img.shields.io/badge/built%20with-DeepSeek%20Harness-4d6bfe)](https://github.com/deepseek-ai/deepseek-harness)
[![PRs](https://img.shields.io/badge/PRs-welcome-ff69b4)]()

<p align="center">
  <img src="docs/preview.svg" alt="dsh-vox preview" width="720"/>
</p>

## ✨ What you get

- 🐳 **Local Whisper** — powered by [whisper.cpp](https://github.com/ggml-org/whisper.cpp), the recognition runs on your own box
- 🌐 **Automatic language detection** — `-l auto` lets the model listen for itself: Chinese, English, even mixed, no button needed
- 🔒 **Private by design** — audio only travels between your browser and your local Host. No third party ever hears you
- ✏️ **Proper punctuation** — Whisper output comes with punctuation and capitalization, a solid step up from browser engines
- ⚡ **Streaming** — while you record, the audio is transcribed every ~5 seconds and the text updates live in the draft; a final full pass polishes it when you stop
- ☁️ **Optional cloud mode** — short on CPU? Flip one line of config to a free-tier cloud Whisper API

## 🧰 Tech stack

| Layer | Tech |
| --- | --- |
| Plugin platform | [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web plugin protocol (`dsh.client` bundle + `__ModuleLoader__` loader + Slot registration) |
| Frontend | React 18 (`createElement` / hooks), `getUserMedia`, `MediaRecorder`, `FileReader` / `fetch` |
| Backend (Host) | Node.js ESM, `webServer` route, `child_process`, [ffmpeg](https://ffmpeg.org) audio conversion |
| Speech recognition | [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (`whisper-cli`, `-l auto` language detection) + `ggml-base` model |
| Optional cloud | OpenAI-compatible `POST /audio/transcriptions` ([Groq](https://console.groq.com) / [SiliconFlow](https://siliconflow.cn) free tiers) |
| Packaging | npm package: client half is a hand-written `__ModuleLoader__` bundle (plain JS, zero build step), host half is native ESM |

## 🖥️ Hardware requirements

| Item | Minimum | Recommended |
| --- | --- | --- |
| CPU | 4-core x86-64 (AVX2 helps a lot) | 8+ cores, near-realtime |
| RAM | 4 GB | 8 GB+ |
| Disk | 2.5 GB free | 5 GB free |
| OS | Linux / macOS / Windows (WSL2) | Linux |
| Software | `git` `cmake` `gcc/g++` `make` `ffmpeg` | same |

> Pro tip: smaller model = cheaper to run, lower accuracy. Slow machine? Go `tiny`. Fast machine? Treat yourself to `small`.

## 📦 How much space it eats

| Model | Size | EN accuracy | ZH accuracy | Speed | For |
| --- | --- | --- | --- | --- | --- |
| `tiny` | 75 MB | ★★ | ★ | blazing | potato PCs |
| `base` | 142 MB | ★★★ | ★★ | fast | **default pick** |
| `small` | 466 MB | ★★★★ | ★★★ | medium | accuracy nerds |
| `medium` | 1.5 GB | ★★★★★ | ★★★★ | slow | enthusiasts |

The whisper.cpp build itself takes about **0.5–1 GB** (intermediate files can be deleted afterwards).
Total ≈ **model size + 1 GB**.

## 🛠️ Installation

### Step 1: toolchain (2 min)

```sh
# Ubuntu / Debian
sudo apt install -y git cmake gcc g++ make ffmpeg
# macOS
brew install cmake ffmpeg
# Windows: use WSL2, then run the apt command inside WSL
```

### Step 2: build whisper.cpp + grab a model (5–10 min)

```sh
git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git ~/whisper.cpp
cd ~/whisper.cpp

# build (8 = parallel jobs, tune to your core count)
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j8 --target whisper-cli

# download the base model (142MB)
curl -L -o models/ggml-base.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
# slow network in some regions? mirror works:
# curl -L -o models/ggml-base.bin \
#   https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
```

### Step 3: install the plugin + write the config (1 min)

```sh
dsh plugin --profile web add github:Btmy520/dsh-vox
```

Then edit `~/.dsh/profiles/web/package.json`, append `"dsh-vox"` to
`dsh.profile.bundles` (the end of the list is fine), and create `~/.config/dsh-vox.json`:

```json
{
  "mode": "local",
  "bin": "/home/your-user/whisper.cpp/build/bin/whisper-cli",
  "model": "/home/your-user/whisper.cpp/models/ggml-base.bin",
  "threads": 8
}
```

Restart with `dsh --profile web` — you'll see the 🎤 button right next to the attach button. That's it.

## ☁️ Free cloud options (optional, for the always-online crowd)

Don't want to burn local CPU/disk? These platforms offer **free tiers** of the Whisper API, with the same automatic language detection:

| Platform | Free tier | Model | Sign up |
| --- | --- | --- | --- |
| Groq (global) | yes (fairly generous rate limits) | whisper-large-v3, absurdly fast | https://console.groq.com |
| SiliconFlow (China-friendly) | yes (new-user credits) | multiple ASR models | https://siliconflow.cn |

Switching to cloud is just an edit of `~/.config/dsh-vox.json`:

```json
{
  "mode": "cloud",
  "baseUrl": "https://api.groq.com/openai/v1",
  "apiKey": "gsk_your-key",
  "model": "whisper-large-v3"
}
```

Restart the web GUI and you're done. **Local ↔ cloud anytime, zero code changes.**

> The tradeoff: cloud gives you large-model accuracy with zero local resources, but your audio leaves the machine and free tiers have quotas; local is fully private and unlimited, but eats CPU and disk. Pick your poison.

## 🎬 Using it

1. Click 🎤 to start recording — the button turns red and pulses; text **streams into the draft roughly every 5 seconds**.
2. Click again to stop — one final full pass polishes wording and punctuation, and the finished text stays in the draft for you to edit and send manually.
3. Text you already had in the box is never lost — the plugin adds a space and appends.
4. Chinese, English, or a mix — the model figures the language out on its own.

## 🧠 How it works

```
click 🎤 → getUserMedia → MediaRecorder captures webm/opus
  → every 5s while recording: audio-so-far is base64 POSTed to the Host (local dsh process)
    ├─ local mode: ffmpeg → 16k wav → whisper-cli -l auto → text
    └─ cloud mode: OpenAI-compatible /audio/transcriptions (no language = auto)
  → text streams back into the draft; one final pass after you stop
```

## ❓ FAQ

**What's the streaming cadence?** Every 5 seconds the *entire audio recorded so far* is transcribed and the draft is refreshed (model reload adds ~1s, so in practice text jumps every 5–7s); the final pass after stopping polishes wording and punctuation. Want faster updates? Lower the `5000` ms in the code — model load time stays constant, so going too low just queues requests.

**Chinese accuracy not great?** Go bigger: switch `model` to `ggml-small.bin` (466MB) or `ggml-medium.bin` (1.5GB) and re-download.

**"ffmpeg not found"?** You skipped Step 1 — `sudo apt install ffmpeg`, then restart the GUI.

**Too slow?** Raise `threads` close to your core count, or drop to a smaller model; still slow, go cloud mode.

**No mic permission?** Allow the microphone in your browser's site permissions and refresh.

## 🗑️ Uninstall

Edit `~/.dsh/profiles/web/package.json`: remove `dsh-vox` from `dependencies` and from
`dsh.profile.bundles`; run `pnpm install`; restart the web GUI. The whisper.cpp folder
and model are yours to keep or delete — deleting them only frees disk.

## 🔗 About the platform

This project is **built with [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness)**:
it mounts into DSH's web GUI through the official web plugin protocol — `dsh.client` bundle +
`__ModuleLoader__` loading + `conversation.input.left` slot registration. Pure plugin play,
zero platform source touched. The recognition engine is [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
(MIT), with model weights from OpenAI Whisper.

## 🤝 Contributing

Found a bug or have an idea? Issues and PRs are more than welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) (中文) for the full guide. There are PR and issue templates ready to go.

## 📄 License

[MIT](./LICENSE) — play with it, fork it, remix it, ship it.
Author: deepseek娘 🐳
