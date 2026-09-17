<p align="center"><img src="docs/assets/ai-inbox.svg" width="64" height="64" alt="AI Inbox"></p>
<h1 align="center">AI Inbox for your browser</h1>
<p align="center"><strong>ChatGPT, Gemini, Claude → Obsidian.</strong></p>
<p align="center">Save the current conversation and its images from Chrome or Microsoft Edge.</p>
<p align="center">English · <a href="README.zh-CN.md">简体中文</a><br><a href="#features">Features</a> · <a href="#install">Install</a> · <a href="https://github.com/elfmedy/obsidian-ai-inbox">Obsidian plugin</a></p>

## Features

- **One click to save.** Capture all messages on the current ChatGPT, Gemini, or Claude conversation branch.
- **Bring images and references.** Download images and convert supported citations to readable links.
- **Find your vault.** Discover running Obsidian vaults, confirm the first connection, and remember your default.
- **Know what happened.** See progress and the final result on the page. Unsupported pages show a small toolbar popup without opening a tab.
- **Chrome and Edge.** Install the same unpacked extension package in either browser.

Gemini and Claude support ordinary text/image chats. Canvas, Artifacts, non-image attachments, and histories that unload messages while scrolling are not yet supported. See the [guide](docs/guide.md) for boundaries.

## Install

Requires the **[AI Inbox Obsidian plugin](https://github.com/elfmedy/obsidian-ai-inbox#install)** on the same computer. Keep Obsidian open when saving. Currently Alpha; distributed as an unpacked extension, not through either browser's store.

1. Install and enable the Obsidian plugin through BRAT: `elfmedy/obsidian-ai-inbox`.
2. Download **`ai-inbox-browser-0.5.1.zip`** from the [latest release](https://github.com/elfmedy/browser-ai-inbox/releases/latest). Do not use GitHub's **Source code** ZIP.
3. Extract it to a permanent folder. The extracted **`ai-inbox-browser`** folder contains `manifest.json`.
4. Open your browser's extensions page and turn on **Developer mode**:

   | Browser | Extensions page |
   | --- | --- |
   | Chrome | `chrome://extensions` |
   | Microsoft Edge | `edge://extensions` |

5. Click **Load unpacked** and select the **`ai-inbox-browser`** folder. Pin AI Inbox to the toolbar for easy access.

Keep this folder after installation: the browser loads the extension from it. Chrome 120+ / a current Chromium-based Edge desktop release are required. Firefox and Safari are not supported.

## Start saving

Open an ordinary ChatGPT, Gemini, or Claude conversation, wait until the reply finishes, and click **AI Inbox**. Approve the first connection in Obsidian. If more than one vault is running, choose a destination; it becomes the default.

Right-click the icon to switch vaults or open settings. Note formatting, thinking summaries, and attachment placement are configured in Obsidian. See the [guide](docs/guide.md) for details and troubleshooting.

## Update

1. Download and extract the new extension ZIP.
2. Copy the files **inside** its `ai-inbox-browser` folder into your **existing extension folder**, replacing matching files.
3. Click **Reload** on the extensions page, then refresh the chat page.

Unpacked extensions need manual updates. Keep the original loaded directory and avoid removing/reinstalling the extension to retain browser-local preferences and pairing. Users upgrading from the old `ai-inbox-chrome` package can keep that folder name and copy the new files into it.

Version **0.5.1** requires Obsidian AI Inbox **0.5.0+** for Gemini and Claude. Update both components for all features; ChatGPT remains compatible with 0.3.0+ receivers. Chrome and Edge have separate extension storage and each needs its own first connection.

---

[Report an issue](https://github.com/elfmedy/browser-ai-inbox/issues) · [Releases](https://github.com/elfmedy/browser-ai-inbox/releases) · [Build from source](CONTRIBUTING.md) · [MIT license](LICENSE)
