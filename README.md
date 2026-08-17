# 🎙️ dsh-vox — 本地 Whisper 语音输入插件

> 对着输入框说话，本机模型自动识别中英文，文字流式蹦进输入框。音频不出门，隐私自己说了算。

<p align="right">
  <img src="https://img.shields.io/badge/lang-中文-red" alt="当前语言"/>
  <a href="./README.en.md"><img src="https://img.shields.io/badge/click_for-English-blue" alt="Switch to English"/></a>
</p>

[![version](https://img.shields.io/badge/version-0.3.0-4d6bfe)](./package.json)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![platform](https://img.shields.io/badge/platform-DeepSeek%20Harness%20Web-4d6bfe)]()
[![built with](https://img.shields.io/badge/built%20with-DeepSeek%20Harness-4d6bfe)](https://github.com/deepseek-ai/deepseek-harness)
[![PRs](https://img.shields.io/badge/PRs-welcome-ff69b4)]()

<p align="center">
  <img src="docs/preview.svg" alt="dsh-vox 按钮盒预览" width="720"/>
</p>

## ✨ 特性

- 🐳 **本地 Whisper 识别**：基于 [whisper.cpp](https://github.com/ggml-org/whisper.cpp)，识别跑在你自己机器上
- 🌐 **语言自动判断**：`-l auto` 让模型自己听——中文、英文、甚至中英混说，自动判定
- 🔒 **隐私**：音频只在「浏览器 ↔ 本机 Host」之间流转，不上传任何第三方
- ✏️ **自动标点**：Whisper 输出自带标点和大小写，比浏览器引擎强一个档次
- ⚡ **流式输出**：录音期间每 5 秒把已录内容送去识别一次，文字边录边出；停止后自动做最后一遍全量精修
- ☁️ **可选云端模式**：联网用户想省资源，改一行配置就能切到免费额度的云端 Whisper API

## 🧰 技术栈

| 层 | 技术 |
| --- | --- |
| 插件平台 | [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web 插件协议（`dsh.client` bundle + `__ModuleLoader__` 加载 + Slot 槽位注册） |
| 前端 | React 18（`createElement` / hooks）、`getUserMedia` 采麦、`MediaRecorder` 录音、`FileReader`/`fetch` |
| 后端（Host） | Node.js ESM、`webServer` 路由、`child_process`、[ffmpeg](https://ffmpeg.org) 音频转码 |
| 语音识别 | [whisper.cpp](https://github.com/ggml-org/whisper.cpp)（`whisper-cli`，`-l auto` 语言自动检测）+ `ggml-base` 模型 |
| 可选云端 | OpenAI 兼容 `POST /audio/transcriptions`（[Groq](https://console.groq.com) / [SiliconFlow](https://siliconflow.cn) 等免费额度 API） |
| 打包分发 | npm 包：Client 半为手写 `__ModuleLoader__` bundle（纯 JS，无构建步骤），Host 半为原生 ESM |

## 🖥️ 电脑配置要求

| 项目 | 最低 | 推荐 |
| --- | --- | --- |
| CPU | 4 核 x86-64（支持 AVX2 更快） | 8 核+，近实时识别 |
| 内存 | 4 GB | 8 GB+ |
| 磁盘 | 2.5 GB 可用 | 5 GB 可用 |
| 系统 | Linux / macOS / Windows(WSL2) | Linux |
| 必备软件 | `git` `cmake` `gcc/g++` `make` `ffmpeg` | 同左 |

> 小技巧：模型越小编译和运行越省，但精度越低；机器慢就选 `tiny`，机器快上 `small`。

## 📦 安装大小（占多少地方）

| 模型 | 大小 | 英文精度 | 中文精度 | 速度 | 适合 |
| --- | --- | --- | --- | --- | --- |
| `tiny` | 75 MB | ★★ | ★ | 极快 | 老爷机 |
| `base` | 142 MB | ★★★ | ★★ | 快 | **默认推荐** |
| `small` | 466 MB | ★★★★ | ★★★ | 中 | 追求精度 |
| `medium` | 1.5 GB | ★★★★★ | ★★★★ | 慢 | 发烧友 |

另外 whisper.cpp 编译产物约占 **0.5 ~ 1 GB**（可以删掉 build 里的中间文件）。
总占用 ≈ **模型大小 + 1 GB**。

## 🛠️ 安装方法

### 第一步：装工具链（2 分钟）

```sh
# Ubuntu / Debian
sudo apt install -y git cmake gcc g++ make ffmpeg
# macOS
brew install cmake ffmpeg
# Windows 用 WSL2，然后在 WSL 里跑上面的 apt 命令
```

### 第二步：编译 whisper.cpp + 下载模型（5 ~ 10 分钟）

```sh
git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git ~/whisper.cpp
cd ~/whisper.cpp

# 编译（8 是并行数，按你 CPU 核数改）
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j8 --target whisper-cli

# 下载 base 模型（142MB）
curl -L -o models/ggml-base.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
# 国内网络慢的话用镜像：
# curl -L -o models/ggml-base.bin \
#   https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
```

### 第三步：装插件 + 写配置（1 分钟）

```sh
dsh plugin --profile web add github:Btmy520/dsh-vox
```

然后编辑 `~/.dsh/profiles/web/package.json`，把 `"dsh-vox"` 追加进
`dsh.profile.bundles`（放最后就行），再创建 `~/.config/dsh-vox.json`：

```json
{
  "mode": "local",
  "bin": "/home/你的用户名/whisper.cpp/build/bin/whisper-cli",
  "model": "/home/你的用户名/whisper.cpp/models/ggml-base.bin",
  "threads": 8
}
```

最后重启：`dsh --profile web`，加号旁边出现 🎤 和 ✈️ 两个按钮，装好了。

## ☁️ 联网用户的免费方案（可选云端模式）

不想吃本地 CPU/磁盘？这些平台提供 **免费额度** 的 Whisper API，语言同样自动识别：

| 平台 | 免费额度 | 模型 | 申请地址 |
| --- | --- | --- | --- |
| Groq（国际） | 有（限速较宽松） | whisper-large-v3，快得离谱 | https://console.groq.com |
| SiliconFlow 硅基流动（国内） | 有（新用户送额度） | 多种 ASR 模型 | https://siliconflow.cn |

切换到云端只需要改 `~/.config/dsh-vox.json`：

```json
{
  "mode": "cloud",
  "baseUrl": "https://api.groq.com/openai/v1",
  "apiKey": "gsk_你的key",
  "model": "whisper-large-v3"
}
```

改完重启 web GUI 生效。**本地 ↔ 云端随时切，代码不用动。**

> 权衡：云端精度高（large 模型）、不吃本地资源，但音频会出网，且免费额度有量级限制；本地完全私有、无限量，但吃 CPU 和磁盘。按需选。

## 🎬 使用

1. 点 🎤 开始录音，按钮变红脉动；录音期间文字**每隔约 5 秒流式更新**进输入框草稿。
2. 再点一下停止，插件对整段录音做最后一遍识别精修，最终文本留在草稿里，随便改、手动发送。
3. 听写前输入框里已有的文字不会丢，插件自动补空格接在后面。
4. 说中文、说英文、混着说都行，模型自己判断语言。

## 🧠 工作原理

```
点 🎤 → getUserMedia 采麦 → MediaRecorder 录 webm/opus
  → 录音期间每 5 秒：已录音频 base64 POST 到 Host（本机 dsh 进程）
    ├─ local 模式：ffmpeg 转 16k wav → whisper-cli -l auto → 文本
    └─ cloud 模式：直连 OpenAI 兼容 /audio/transcriptions（language 留空=自动）
  → 文本流式写回输入框草稿；停止后再做一遍全量精修
```

## ❓ 常见问题

**流式识别的节奏是怎样的？** 录音期间每 5 秒把「目前录到的所有音频」整体识别一次并刷新草稿（模型每次重载约 1 秒，所以实际约 5~7 秒跳一次字）；停止时做最后一遍全量识别，精修措辞和标点。想跳字更快，把代码里 `5000` 这个毫秒数调小即可（模型加载耗时不变，太短了会频繁排队）。

**中文识别不准？** 换大模型：把 `model` 换成 `ggml-small.bin`（466MB）或 `ggml-medium.bin`（1.5GB），重新下载即可。

**提示「找不到 ffmpeg」？** 没装第一步的工具链，`sudo apt install ffmpeg` 后重启 GUI。

**识别太慢？** 把 `threads` 调到接近 CPU 核数，或换小模型；还嫌慢就切云端模式。

**没有麦克风权限？** 浏览器地址栏的站点权限里允许麦克风，刷新页面即可。

## 🗑️ 卸载

编辑 `~/.dsh/profiles/web/package.json`：从 `dependencies` 删掉 `dsh-vox`，
`dsh.profile.bundles` 里的对应行也删了；然后 `pnpm install`，重启 web GUI。
whisper.cpp 目录和模型想留想删随意（删掉只是不占地方）。

## 🔗 开发声明

本项目**使用 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 开发**：
通过官方 web 插件协议挂载到 DSH 的 Web GUI——`dsh.client` bundle + `__ModuleLoader__` 加载 +
`conversation.input.left` 槽位注册，全程纯插件玩法，没有动平台一行源码。
识别引擎为 [whisper.cpp](https://github.com/ggml-org/whisper.cpp)（MIT），模型权重来自 OpenAI Whisper。

## 📄 许可

[MIT](./LICENSE)，随便玩、随便改、随便拿去二创。
作者：deepseek娘 🐳
