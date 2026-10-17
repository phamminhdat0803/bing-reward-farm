# BYOK keyword generation review — 2026-10-17

Reviewed the new keyword AI configuration, generation service, renderer controls and their IPC registrations. No actionable security findings were identified in this scoped pass. This does not cover the application's other preload APIs or third-party provider infrastructure.

## Boundaries checked

- `src/main/index.ts:1610`: AI IPC handlers accept calls only from this application's main window and its main frame. Model text is displayed as textarea/table text, never evaluated or rendered as HTML.
- `src/main/keyword-ai.ts:22`: configuration reads expose endpoint/model/mode and key-presence flags, not ciphertext or decrypted keys. `saveKeywordAiConfig` uses Electron `safeStorage`, refuses plaintext fallback, and requires a new key or explicit deletion when changing endpoints. File writes use a temporary file plus rename.
- `src/main/keyword-ai.ts:44`: provider requests require HTTPS except explicitly configured loopback HTTP. URL credentials, query strings, fragments and full method URLs are rejected. Redirects are refused, preventing automatic credential forwarding to a different endpoint. User-selected custom providers are intentionally trusted destinations.
- `src/main/keyword-ai.ts:72`: SDK logging and automatic retries are disabled; organization/project environment settings are not forwarded. Provider error bodies are replaced with fixed status-based messages before returning to the renderer.
- `src/main/keyword-ai.ts:129`: generation uses one active job, bounded input/count/batch sizes, response-size limits, request timeouts, cancellation and a maximum number of batches. Completed batches persist as a draft; generation does not write the keyword library. Import remains a separate user action.

## Evidence

- `node --test tools/test-keyword-ai.mjs tools/test-keywords.mjs tools/test-policy-search.mjs`: eight tests passed. The real `openai` SDK was exercised against a loopback mock, including both API routes, 1,501 keywords in 16 requests, cancellation, duplicate exhaustion, error sanitization, redirect refusal and unchanged keyword storage.
- `node_modules/.bin/electron tools/test-keyword-ai-encryption.cjs`: Electron encryption/decryption passed on this Windows machine using a synthetic key and isolated temporary userData. No real provider credentials were used.
- Renderer fixture: configured a custom endpoint, saved a synthetic key, tested connection, generated 1,500 mocked keywords, moved the draft into the import dialog, and explicitly appended it. The library stayed unchanged until import.
- Typecheck and production build passed. Real provider authentication, billing and model-specific compatibility remain untested until the user supplies settings in the application.
