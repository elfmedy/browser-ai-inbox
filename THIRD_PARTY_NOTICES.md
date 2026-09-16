# Third-party code and attribution

AI Inbox's original code is MIT licensed, copyright 2026 elfmedy. The following
upstream implementations informed adapted portions of the capture and rendering code.
Their notices apply to those portions; original authorship is not reassigned.

## chatgpt-conversation-export

- Author: Thierry Abalea. License: MIT, copyright 2026 Thierry Abalea.
- Source: https://github.com/ThierryAbalea/chatgpt-conversation-export
- Revision: `543a98a3f6cfb0f59ad23cd1c0b6d070f4e98324`.
- Upstream file: `extension/popup.js`, preceding-page collection inside `fetchConversation`.
- Adaptation: `src/capture/paginated-messages.ts` and the pagination integration
  in `src/capture/observed-request.ts`.
- Changes: TypeScript module; injected bounded requests; identity, branch, page
  boundaries, overlap, size and progress checks; final head reread; no bulk export
  or raw JSON download; assembled coverage derived from validated page boundaries.
- Full license: `third-party/chatgpt-conversation-export.LICENSE`.

## chatgpt-exporter

- Thinking support in `src/capture/thinking.ts` also uses the same pinned
  `src/api.ts` thought/recap shapes and `reasoning_title` classification from
  `attachThinkingToNodes`. Changes: bounded unknown-input parsing, explicit
  per-Vault opt-in, collapsed Markdown callouts, expanded UI identity handling,
  and strict separation from raw analysis / tool input and output. The existing
  MIT license below applies; thinking support was checked with synthetic fixtures.

- Author: Pionxzh. License: MIT, copyright 2022-Present Pionxzh.
- Source: https://github.com/pionxzh/chatgpt-exporter
- Revision: `d0f44aae9d5650852b2979bbf830590b41f7b804`.
- Upstream file: `src/api.ts`, tool image detection in `shouldSkipMessageInExport`,
  `fetchImageFromPointer` and `fileDownloadApi`.
- Adaptation: `src/capture/image-parts.ts`, message classification, and the
  candidate `src/assets/chatgpt-image.ts` downloader.
- Changes: unknown-input validation; typed image extraction; bounded downloads;
  redirect refusal; no credential forwarding to CDN; Tool image support uses bounded, validated downloads. No upstream UI copied.
- Full license: `third-party/chatgpt-exporter.LICENSE`.
- Additional upstream file: `src/utils/citations.ts`, adapted as
  `src/render/citations-upstream.ts`. Changes preserve original typography,
  whitespace and unresolved markers; the wrapper excludes code/TeX and bounds
  and validates metadata URLs. This adaptation is integrated in the alpha capture.
- Alpha 0.1.3 restores upstream U+E203/U+E204 normalization on both content and
  matched references. Unlike upstream's residual-marker deletion, unresolved
  markers remain labeled, inert literal text with exact Unicode escapes; no
  source URL is inferred. Source typography and original code/TeX are preserved.
- User-facing `commentary` retention follows `shouldSkipMessageInExport` and
  channel handling in `mergeContinuationNodes` in `src/api.ts`. AI Inbox keeps
  original message IDs/order rather than merging adjacent assistant records;
  hidden/reasoning/tool-directed messages remain excluded.
- From 0.5.0, commentary inside a segment containing thought/recap records is
  grouped with the thinking panel, including activity without `reasoning_title`.
  User/final-answer boundaries keep standalone ordinary commentary separate.

## OwlCt/ChatGPT-Export

- License: MIT, copyright 2026 huhu.
- Source: https://github.com/OwlCt/ChatGPT-Export
- Revision: `ea52daa231c877fafce9d849b390a64fa03ca349`.
- Upstream file: `Tampermonkey.js`, nested/flat image inspection,
  `normalizeAssetId`, `resolveFileDownloadUrl` and `fetchImageBlob`.
- Adaptation: image/attachment inspection in `src/capture/image-parts.ts` and
  the second resolver route in `src/assets/chatgpt-image.ts`.
- Changes: strict reference syntax, finite 404/405 route fallback, bounded JSON
  and bytes, HTTPS destination checking, no silent skip-on-error or URL logging.
- Attachment compatibility also adapts `inspectFileAttachment`: `file_name`,
  nested `file`, MIME aliases, and stable identifiers for unnamed attachments.
- Full license: `third-party/owlct-export.LICENSE`.

## Pinned Markdown dependencies

`mdast-util-from-markdown` 2.0.3, `mdast-util-gfm` 3.1.0,
`micromark-extension-gfm` 3.0.0, `mdast-util-math` 3.0.0 and
`micromark-extension-math` 3.1.0 support the independent body renderer.
All are MIT licensed. Their transitive versions are locked in package-lock.json;
complete non-dev dependency license texts are generated into
`third-party/npm-dependencies.txt` and included in the release build.
The renderer is connected to the alpha browser/writer entry points. `zod` 4.6.2 (MIT) validates snapshots, local state and
protocol input; its full license is included in the generated dependency notices.


This repository was split from https://github.com/elfmedy/obsidian-ai-inbox at commit `68dc2aab82ac4da1acd614a0978cba18b4bde840`. Original copyright and adapted-code licenses are retained.

## AI Chat Exporter

- Source: https://github.com/TheBluCoder/AI-chat-exporter
- Revision: `3253d7696a112204137c4c3a1843a3c7d20e14b9`.
- License: MIT, copyright 2024 AI Chat Exporter Contributors.
- Upstream: `src/scrapers/config/gemini.config.js`, `claude.config.js`,
  platform scrapers and `src/scrapers/base/BaseScraper.js`.
- Adaptation: `src/capture/dom-providers.ts`: message/content selectors,
  ancestor scroll-container detection and bounded top-loading. Updated for the
  live DOM, Claude ARIA sequence validation, detached DOM conversion, explicit
  unsupported-content errors and source-change checks. No silent message skipping.
- Full license: `third-party/ai-chat-exporter.LICENSE`.
- HTML-to-Markdown uses Turndown and its GFM plugin (MIT). Exact versions and
  full transitive licenses are in `third-party/npm-dependencies.txt`.
