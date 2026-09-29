# Changelog

## 0.5.3

- Save validated ChatGPT API branches when page message attributes are unavailable; scrolling and partial DOM visibility no longer block capture.
- Retain explicit branch-conflict checks and compare raw branch identities before submission. Accept extra pagination metadata while enforcing known coverage boundaries.
- Add redacted DOM-witness and API-recheck diagnostics. API failures never silently fall back to partial DOM export.
- ChatGPT 页面结构变化或仅显示部分消息时，仍可保存通过接口校验的分支；保留分支冲突、历史完整性及提交前变化检查，并补充脱敏诊断。

## 0.5.2

- Save ChatGPT conversations when request records are missing or contain multiple matching routes; retain identity, branch and pagination validation.
- Name unavailable default vaults, list connectable alternatives and add a switch-vault action. Clarify per-vault plugin installation.
- Unify browser language selection and explain how to save from a new-chat page.
- Add redacted request-selection and source-change diagnostics.

## 0.4.0

- First independent browser release for Chrome and Microsoft Edge.
- English and Chinese unpacked installation and update guides.
- Preserve existing capture, images, pairing, default-vault selection, and saved settings.

## Earlier releases

The extension previously shipped with [obsidian-ai-inbox](https://github.com/elfmedy/obsidian-ai-inbox/releases).

- **0.3.1:** fix duplicate context menu IDs during overlapping initialization.
- **0.3.0:** respect per-vault thinking and title settings.
- **0.2.0:** discover running vaults and remember the default after pairing.
