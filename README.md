# Requestbench desktop

A local API client built with **Tauri 2, Rust, React, and TypeScript**. The Rust engine makes HTTP requests directly; a local web server is not needed in the packaged app.

## Run the macOS app

Built apps are not committed to this repository. Run `npm ci` and `npm run desktop:build`, then open `src-tauri/target/release/bundle/macos/Requestbench.app`. A locally packaged copy may also be available at `release/Requestbench.app`. The local build is for Apple Silicon macOS. The delivered copy is ad-hoc signed for local use; it is not signed with a Developer ID or notarized for public distribution. Windows/Linux packaging has not been verified.

For development, install Node.js 22+ and Rust using rustup, then:

```sh
npm ci
npm start
```

You can also double-click `Start Requestbench.command`. The first Rust build downloads dependencies and takes longer. Development uses Vite on port 1420; packaged builds embed the compiled interface.

```sh
npm run desktop:build
```

## What works

- Saved requests, request tabs, and an expandable collection/category sidebar with nested folders, request counts, and search by API name, category, or HTTP method.
- HTTP(S) GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS.
- Editable headers, raw bodies, bearer tokens, and Basic authentication.
- Environment selection and `{{variable_name}}` substitution in URLs, headers, bodies, and auth fields.
- Native request cancellation, 30-second timeouts, response status, timing, headers, size, and formatted JSON/text.
- JSON request-body fixtures and saved response samples.
- Native JSON file import/export for whole workspaces or individual items.
- Basic Postman v2.1 collection import: nested folders, raw requests/bodies, headers, collection variables, inherited bearer/Basic auth. Postman environment JSON imports are also supported. Unsupported auth, body modes, scripts, and invalid methods are preserved in the original request details. Affected requests import with review notes and cannot send until you explicitly choose to use the current configuration without the unsupported Postman features.
- SQLite workspace persistence and the last 100 successful HTTP exchanges (including HTTP error statuses).
- OS credential-store protection for environment variables marked secret.
- Automatic save, explicit Save, and save-before-close. Cmd/Ctrl+S saves; Cmd/Ctrl+Enter sends.

The starter `requestbench://demo` request is a built-in Rust-generated response for trying the interface offline. It does not perform an HTTP exchange. Enter an HTTP(S) URL to call a real API.

## Sharing and migration

**Export workspace** produces a versioned Requestbench JSON file. **Import** previews its item counts, then adds copies with fresh IDs. Existing items are not overwritten. The export button next to an item name shares just that item.

Secret environment values are omitted by default. If enabled in the export dialog, values are retrieved from the OS credential store. Literal credentials in request URLs, headers, bodies, auth fields, or fixtures export as written—use secret variables instead.

The original browser prototype remains available with `npm run legacy`; its files were preserved in `public/` and `server.mjs`. To migrate its localStorage workspace, export it from the prototype and import that JSON in the desktop app. The desktop app does not read or modify the browser profile automatically. `examples/shared-workspace.json` demonstrates the shared format.

Fixtures must contain valid JSON to export. A fixture copies its body into a request when selected from the Body tab; it is not a live link or mock endpoint. Postman exports are accepted on import only; exports use Requestbench's own format.

## Storage and credentials

On macOS the database is at:

```
~/Library/Application Support/com.requestbench.desktop/workspace.sqlite3
```

Secret environment values are stored under the `com.requestbench.desktop` service in macOS Keychain (OS credential providers are configured for Windows/Linux too). SQLite stores a blank value and a presence marker. A blank field marked **Stored securely** retains its saved value. Enter a value to replace it, or click its lock button to clear it. Clear a stored secret before renaming its key. Removing an item from the workspace does not remove orphaned keychain entries; these can be removed through the OS credential manager.

Request/response payloads and URLs are not written to history. Saved request bodies and inline authentication fields are persisted as entered. Workspace data other than marked environment secrets is not encrypted.

## Limits and remaining scope

- Collection imports have no fixed file-size or item-count cap. Parsing runs in a background worker, and sidebar rows load in batches. Available memory still limits the largest file the app can process.
- Outgoing request bodies remain limited to 2 MB and displayed HTTP responses to 5 MB.
- Redirects are shown, not followed. TLS certificate validation stays enabled.
- Response display is text/JSON; binary and streaming response workflows are not implemented.
- No multipart attachments, OAuth login flows, scripts/assertions, cookie jar, collection runner, WebSockets, cloud sync, or collaborative editing.
- Imported folder paths are displayed as nested categories. Edit a request’s Collection field to change its group; use ` / ` between levels. Empty folders and drag-and-drop folder management are not implemented.
- Imported Postman response examples are not yet converted into fixtures. Requests with disabled Postman query parameters are flagged for review before sending.

## Verification

```sh
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

TypeScript tests cover legacy JSON compatibility, secret omission, round trips, Postman imports, and malformed/unsupported imports. Rust tests cover variable substitution, SQLite persistence, credential-store failure behavior, rejection of non-HTTP URLs, and real local HTTP/redirect handling. Credential-store tests use a fake store and do not access real credentials.

See `VERIFICATION.md` for completed checks and unverified paths.

## Workflow assistant (0.3.0)

Open **Workflow assistant**, enter a goal such as “Show me APIs to create and update a profile”, and choose **Build workflow**. Local collection search works offline using endpoint names, folders, descriptions, action words, and resource synonyms. It is a deterministic search mode, not an AI model. For the imported Zenoti collection, this example selects **Create a guest → Update a guest** and explains the interpretation of “profile”. You can replace selected endpoints or open them in the request editor.

For AI planning, choose **OpenAI workflow planning** and add your own API key in **AI settings**. The key is stored separately under `com.requestbench.ai` in macOS Keychain and never included in workspace exports. The default model is `gpt-5-mini`; the model field is editable. API charges apply to your provider account. Each request previews the goal and metadata for up to 40 locally ranked candidate endpoints before **Send to OpenAI**. Metadata includes names, categories, redacted URL patterns, body field names/types, and review flags. Header values, environment values, sample body values, and scripts are excluded. Names, field names, and paths can still contain private information: inspect the preview before sending. Requests use `store: false` (this does not imply zero provider retention).

The model selects only known endpoint IDs through a strict schema; code generation stays local and derives from the saved requests. Python (`requests`) and TypeScript (Node.js 22+ `fetch`) starters support JSON/JSONC bodies, bearer/Basic authentication, variable substitution, error handling, and timeouts. Copy or save `.py` / `.ts` files. Strings become placeholders, numeric samples become 0, and boolean samples become false; review all payloads. No generated request executes automatically. Unsupported imported features block generated execution until you review and implement them.

Arrows indicate suggested order, not verified data dependencies. Response schemas are not available to the planner, so identifier mappings are explicit TODOs. Before version 0.5.0, plans were session-only. Current versions save workflow drafts per project. The assistant searches saved requests, not standalone fixture bodies, and does not execute workflows.

Provider implementation references: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini).

## Visual workflow builder (0.4.0)

Build a suggested workflow or choose **New blank workflow**. Use the API library to search and add saved requests from any category. Each connected node shows its method, URL, headers/auth summary, payload presence, and response availability. Drag the node header to change its canvas position; use **Move step earlier/later** in the inspector to change execution order and generated Python/TypeScript order. **Arrange & fit**, zoom controls, and canvas scrolling make larger workflows navigable. Removing a node only removes it from the current plan, not from the saved collection.

Select **Request**, **Payload**, or **Response** on a node to inspect it. Requests are saved templates, with unresolved environment variables. Sensitive header values are hidden by default; payloads are displayed locally as saved. The response view can display the last captured result from this app session (including HTTP status, timing, headers, and body), an imported Postman response example, or a manually chosen response fixture. These sources are labeled separately. A last result can predate edits to its request; the canvas does not execute calls. Use the request editor to send an individual request and return to the workflow to see its result.

New Postman imports preserve response examples through Requestbench export/import. Previously imported collections that discarded examples do not gain them retroactively. Response fixtures have no automatic endpoint association. Connections indicate call order; automatic field mappings, branching, and workflow execution are not implemented. Workflow drafts are saved per project as of 0.5.0; canvas layouts remain session-only.

## OpenAI request feedback (0.4.1)

Sending a workflow to OpenAI shows an animated working panel with the model, endpoint count, elapsed time, and a longer-wait message after 30 seconds. It indicates activity rather than estimated completion. Duplicate sends are blocked while the request is pending. Completion shows a success or no-matches message. Failures remain visible with error details and actions to retry the same request, edit AI settings, or use local search; failed requests leave the current workflow intact. Animations respect reduced-motion preferences.

## Projects and product exploration (0.5.0)

The app opens on a project dashboard. Create a named project for each product or initiative, add a description, and open it to explore its capabilities. Rename projects in **Manage**, or archive and restore them without deleting data. **Switch or manage projects** saves the open workspace before returning to the dashboard. Imports and exports apply to the current project.

Each project has independent requests, environments, examples, and activity history. On first launch, the existing workspace and history are copied into **My first project**. Original SQLite tables remain untouched as a migration backup; environment IDs stay unchanged so existing Keychain references continue to work. Older app versions do not understand project storage and should not be used for editing after migration.

The project **Overview** groups APIs into capabilities and includes a short glossary. Selecting an API opens a plain-language page with the imported description, a request-to-result diagram, observed input field names/types, and guidance about side effects and response statuses. This page never sends requests, including with the send keyboard shortcut. **Open technical editor** reveals the existing URL, headers, body, authentication, and Send controls. Summaries are inferred from HTTP methods and imported examples; they do not invent required fields, response schemas, or business guarantees.

Workflow questions and the latest plan are saved locally per project, including across restarts. They are kept in the app's local UI storage, separate from project JSON exports. Canvas positions and captured responses remain session-only. API keys remain in Keychain and are shared at the app level. Workflow drafts created in earlier app versions cannot be recovered automatically because those versions did not save them.

Project opening does not read your OpenAI key. To check a saved key explicitly, use **AI settings → Check saved key**. Credential operations run off the UI thread so a macOS Keychain prompt cannot freeze project browsing.
