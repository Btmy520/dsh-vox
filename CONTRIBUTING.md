# 贡献指南

谢谢你愿意给 dsh-vox 递 PR！流程很简单，跟着下面走就行。

## 本地开发环境

1. 按 [README](./README.md) 装好 whisper.cpp + 模型 + ffmpeg（走 cloud 模式可以跳过模型，但测语言自动判断还是建议本地）
2. 把本仓库链接进你的 web profile：

   ```sh
   dsh plugin --profile web add /path/to/dsh-vox
   # 然后把 "dsh-vox" 加进 ~/.dsh/profiles/web/package.json 的 dsh.profile.bundles
   ```

3. 改 `lib/` 下的代码 → 重启 `dsh --profile web` 验证
4. 快速自检：

   ```sh
   node --check lib/client.js && node --check lib/index.js
   # 识别管线测试（真人或 TTS 音频均可，中文建议用真人音频，TTS 中文机械音模型识别不了）：
   node -e "import('./lib/index.js').then(async m => console.log(await m.transcribeLocal(m.loadConfig(), '/path/to/test.wav')))"
   ```

## 代码约定

- **Client 半**是纯 JavaScript（无 JSX / 无 TypeScript），必须保持 `window.__ModuleLoader__.load({ id, factory })` 包壳格式，外部依赖只允许 `require("react")`
- **Host 半**是 Node ESM，新增纯函数尽量 `export`（方便测试），副作用挂在 `ctx.effect` 里随 fiber 清理
- 定时器、麦克风流、路由等一切副作用都要能被卸载回收（切会话/卸载插件不残留）
- 注释用中文，风格跟现有代码保持一致
- 按钮盒想加新按钮：直接在 `VoiceToolBox` 的 return 里追加，布局不用动

## 提交与 PR

- 提交信息一句话说清改动（中文），例：`流式间隔改成 3 秒，降低输出延迟`
- 一个 PR 只做一件事，别混着改
- PR 描述里写清：动机 / 改动 / 测试方式（按 PR 模板填即可）
- 改了界面（按钮、文案、样式）记得同步 `README.md` 和 `docs/preview.svg`

## 常见方向（欢迎认领）

- 更细的流式粒度（分段 + 滑动窗口识别）
- 更多语言显式支持入口 / 术语表（热词）接入
- Windows 原生支持与安装文档
- 云端模式增加更多免费平台预设
