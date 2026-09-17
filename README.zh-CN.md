<p align="center"><img src="docs/assets/ai-inbox.svg" width="64" height="64" alt="AI Inbox"></p>
<h1 align="center">AI Inbox · 浏览器扩展</h1>
<p align="center"><strong>ChatGPT、Gemini、Claude，一键保存到 Obsidian。</strong></p>
<p align="center">在 Chrome 或 Microsoft Edge 中，将当前对话和图片一起保存。</p>
<p align="center"><a href="README.md">English</a> · 简体中文<br><a href="#功能">功能</a> · <a href="#安装">安装</a> · <a href="https://github.com/elfmedy/obsidian-ai-inbox/blob/main/README.zh-CN.md">Obsidian 插件</a></p>

## 功能

- **一键保存对话。** 保存当前 ChatGPT、Gemini 或 Claude 聊天分支的全部消息。
- **图片和引用一起带走。** 下载图片，将支持的引用转换为可阅读的链接。
- **自动找到仓库。** 发现已运行的 Obsidian 仓库，首次确认连接后记住默认目标。
- **保存结果看得见。** 页面内显示进度与结果；不支持的页面只显示工具栏小提示，不另开标签页。
- **Chrome、Edge 都能使用。** 两种浏览器安装同一个解压包。

Gemini、Claude 支持普通文字和图片聊天；Canvas、Artifacts、非图片附件，以及滚动时卸载消息的历史暂不支持。具体边界见[使用指南](docs/guide.zh-CN.md)。

## 安装

需要在同一台电脑上安装 **[AI Inbox Obsidian 插件](https://github.com/elfmedy/obsidian-ai-inbox/blob/main/README.zh-CN.md#安装)**，保存时保持 Obsidian 打开。当前为 Alpha，通过“加载已解压的扩展程序”安装，尚未上架浏览器商店。

1. 通过 BRAT 安装并启用 Obsidian 插件：`elfmedy/obsidian-ai-inbox`。
2. 从[最新 Release](https://github.com/elfmedy/browser-ai-inbox/releases/latest) 下载 **`ai-inbox-browser-0.5.1.zip`**，不要下载 GitHub 自动生成的 **Source code** ZIP。
3. 解压到固定目录，解压后的 **`ai-inbox-browser`** 文件夹内应有 `manifest.json`。
4. 打开浏览器的扩展管理页，启用 **开发者模式**：

   | 浏览器 | 扩展管理页 |
   | --- | --- |
   | Chrome | `chrome://extensions` |
   | Microsoft Edge | `edge://extensions` |

5. 点击 **加载已解压的扩展程序 / Load unpacked**，选择 **`ai-inbox-browser`** 文件夹，并将 AI Inbox 固定到工具栏。

安装后请保留这个目录，浏览器会继续从中加载文件。要求 Chrome 120+ 或当前 Chromium 内核的 Edge 桌面版；不支持 Firefox、Safari。

## 开始使用

打开 ChatGPT、Gemini 或 Claude 普通聊天，等待回复完成，点击 **AI Inbox**。首次在 Obsidian 中确认连接；多个仓库时选择目标，选择后即成为默认。

右键图标可以切换仓库或打开设置。正文格式、思考摘要和附件位置在 Obsidian 中设置。详细步骤与常见问题见[使用指南](docs/guide.zh-CN.md)。

## 更新

1. 下载并解压新版扩展 ZIP。
2. 将其中 `ai-inbox-browser` 文件夹**内部的文件**复制到**原来加载的扩展目录**，替换同名文件。
3. 在扩展管理页点击 **重新加载**，然后刷新聊天页面。

解压安装的扩展需要手动更新。保留原加载目录，避免先移除再重装，以保留浏览器中的设置和连接。从旧版 `ai-inbox-chrome` 包升级时，可以继续使用原目录名，把新版文件复制进去即可。

保存 Gemini 和 Claude 需要两端均为 **0.5.0 及以上版本**，请同时更新。ChatGPT 仍兼容 0.3.0 及以上的接收插件。Chrome 和 Edge 各自保存扩展数据，首次连接也需要分别确认。

---

[反馈问题](https://github.com/elfmedy/browser-ai-inbox/issues) · [版本更新](https://github.com/elfmedy/browser-ai-inbox/releases) · [开发说明](CONTRIBUTING.md) · [MIT 开源许可](LICENSE)
