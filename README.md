# 🎙️ dsh-vox — 让你的输入框会听人话

哈喽！这是给 DeepSeek Harness 网页版做的一个语音输入小插件。
懒人福音：嘴比手快的时候，点一下麦克风，对着屏幕说话，字就自己跑进输入框里了。

[![version](https://img.shields.io/badge/version-0.1.0-4d6bfe)](./package.json)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![platform](https://img.shields.io/badge/platform-DeepSeek%20Harness%20Web-4d6bfe)]()
[![built with](https://img.shields.io/badge/built%20with-DeepSeek%20Harness-4d6bfe)](https://github.com/deepseek-ai/deepseek-harness)
[![PRs](https://img.shields.io/badge/PRs-welcome-ff69b4)]()

<p align="center">
  <img src="docs/preview.svg" alt="dsh-vox 按钮盒预览" width="720"/>
</p>

## 这玩意儿是干嘛的

装完之后，输入框左边、加号（📎 附件按钮）屁股后面会多出一个**横排按钮盒**，目前住着两个按钮：

- 🎤 **麦克风**：点一下开始听，你说的话**实时**出现在输入框里（中间结果一个字一个字往外蹦那种）；再点一下停。收音的时候它会变红一闪一闪的，生怕你不知道它在听。
- ✈️ **小飞机**：自动发送开关。点亮它，停止识别的时候直接把草稿发出去，连回车都省了。

一些值得夸的小细节：

- 听之前输入框里已有的字不会丢，插件会乖乖在中间补个空格再接上
- 说完不发送的话，文字就留在草稿里，随便改
- 切会话自动闭嘴，不会在后台偷听你讲悄悄话
- 颜色全走主题 token，深色浅色、各种皮肤都好看
- 按钮盒是 flex 横排，想加按钮直接往里塞，布局一点不用动

## 怎么装

```sh
# 1) 把包装上
dsh plugin --profile web add github:Btmy520/dsh-vox

# 2) 编辑 ~/.dsh/profiles/web/package.json：
#    dependencies 已经由上面那步写好了，再把 "dsh-vox" 追加进
#    dsh.profile.bundles（放最后就行）：
#   "dsh": { "profile": { "bundles": [
#     "@deepseek-ai/dsh-base",
#     "@deepseek-ai/dsh-web-app",
#     "dsh-vox"
#   ] } }

# 3) 重启，完事儿
dsh --profile web
```

## 怎么用

1. 打开任意会话，加号旁边看到两个小按钮，说明装好了。
2. 点 🎤，浏览器第一次会问你要麦克风权限，给一次就行。
3. 开说，字自己往里流；说完再点一下停。
4. 想说完就发？先点亮 ✈️ 再听写，停下的瞬间自动发送。

## 想加按钮 / 想换语言？

都在 `lib/client.js` 里，特别好找：`VoiceToolBox` 的 return 那儿就是按钮盒，
照着现有的写法再 `React.createElement` 一个按钮就行。常见玩法：语种切换、清空语音文本、标点模式。

想换识别语言只需要改一行：`rec.lang = "zh-CN"` 换成 `"en-US"`、`"ja-JP"` 随便你。

## 常见问题（就仨，别慌）

**为什么 Firefox 上按钮是灰的？**
不怪插件，Firefox 到现在都没实现 Web Speech API。换 Chrome / Edge 就好。

**我说的话被传到哪去了？**
识别是浏览器厂商的服务干的（Chrome 走 Google），插件本身不碰你的音频、也不转发任何数据。

**能离线用吗？**
现在不能。想离线得接本地 Whisper 之类的模型，欢迎提 PR，大肥鱼给你加鸡腿（精神上的）。

## 卸载

编辑 `~/.dsh/profiles/web/package.json`：从 `dependencies` 删掉 `dsh-vox`，
`dsh.profile.bundles` 里的对应行也删了；然后在 `~/.dsh/profiles/web` 跑一次
`pnpm install`，重启 web GUI。（本目录也可以整个删掉。）

## 🔗 开发声明

本项目**使用 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 开发**：
通过官方 web 插件协议挂载到 DSH 的 Web GUI——`dsh.client` bundle + `__ModuleLoader__` 加载 +
`conversation.input.left` 槽位注册，全程纯插件玩法，没有动平台一行源码。

## 许可

[MIT](./LICENSE)，随便玩、随便改、随便拿去二创。
作者：大肥鱼 🐳
