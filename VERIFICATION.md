# Verification — Requestbench 0.2

Verified on Apple Silicon macOS on 2026-09-28.

- Production TypeScript/Vite build passed.
- Tauri release app bundle built successfully. The delivered copy was ad-hoc signed; `codesign --verify --deep --strict` passed.
- 7 TypeScript tests passed: legacy JSON import, export/import round trip, secret omission, input validation, supported Postman collection/environment conversion, unsupported Postman feature rejection.
- 8 Rust tests passed: interpolation, SQLite replacement, secret stripping before persistence, credential-store error propagation, cancellation, invalid protocol rejection, real HTTP redirect handling, and a real JSON POST with a resolved bearer token.
- Native desktop UI opened successfully and was visually inspected.
- The UI sent the built-in Rust demo and a real request to a temporary local HTTP server; both showed 200 responses and response content.
- Saving a JSON response as a fixture worked; its persistence was confirmed in SQLite.
- Native workspace export completed through the macOS Save dialog. The resulting JSON contained the expected request, environment, and two fixtures.
- Native import reached the macOS file picker. File selection was interrupted by user interaction, so the complete native import path was not verified in the UI. Parsing and conversion are covered by the TypeScript tests.
- Save-before-window-close is implemented, but reopening persistence was not exercised in the UI. The saved database contents were checked directly.
- Keychain integration is implemented; secret handling tests use a fake store. A live Keychain round trip was not performed.

The bundle is a local development build, not a notarized public release. Windows and Linux builds are not verified.


## 0.2.1 — large collection imports

- Removed both native and frontend 5 MB import limits, plus 1,000-item import caps.
- Native file reading runs on a blocking worker; JSON conversion runs in a web worker. Sidebar entries render in batches while search covers all items.
- 10 TypeScript and 10 Rust tests passed. Regression cases include a 30.38 MB Postman collection with 2,500 requests, Requestbench imports exceeding 1,000 entries in each category, native reading of an 8 MB file, and blocked execution of requests awaiting imported-feature review.
- The production web worker parsed the 30.38 MB fixture successfully. The native file-picker-to-preview path showed all 2,500 requests; the preview was cancelled to avoid adding generated test data to the user's workspace.
- The user's 6.9 MB collection parsed all 224 requests and one variables environment. 59 requests retain review flags for unsupported scripts/body modes or invalid methods. Original request definitions and inherited scripts survive Requestbench export/import.
- No real API requests from the user's collection were sent during verification.
- No fixed import size limit remains; practical capacity depends on available memory. The HTTP request/response body limits are unchanged.
- Final native UI verification: the original 6.9 MB collection preview showed 224 requests and 59 review flags. Confirmed import and save completed; the workspace now has 225 requests including the original demo, three environments, and two existing fixtures. Existing items were preserved.

## 0.2.2 — collection categories

- Reconstructed the sidebar hierarchy from the saved collection paths, including nested categories and descendant request counts. No request data was migrated or reimported.
- Verified that all 18 top-level category names and their order match the uploaded Postman collection, with all 224 source requests represented.
- Four grouping regression tests cover nested paths, repeated subgroup names under different parents, category/request search, unfiled requests, and 2,500 requests in one group. All 14 TypeScript tests and the production build passed.
- Built and ad-hoc signed the macOS app; strict code-signature verification passed.
- Native UI verified the expandable Zenoti API category list and Employees → BlockOutTimes → request hierarchy. Existing workspace counts remained unchanged after reopening.
- Native search interaction was interrupted by user interaction; category-search behavior is covered by automated tests.

## 0.3.0 — workflow assistant

- 19 TypeScript tests passed (18 in the full suite plus the added body-example regression), including profile/guest discovery, duplicate import handling, missing matches, metadata/sample-secret exclusion, unknown AI endpoint rejection, and unsupported-feature guards.
- Generated Python was parsed and executed against a mock `requests` module; generated TypeScript was compiled and executed against a mock `fetch`. Verified no automatic calls, bearer substitution, percent-encoded identifiers, and missing-variable errors in Python. No user API was called.
- 13 Rust tests passed, including strict provider schema/endpoint IDs, store:false, completed/incomplete parsing boundaries, and rejection of unexpected context fields. Existing persistence, credential separation, request, cancellation, and import tests remain passing.
- The user's source collection returned Create a guest (POST) followed by Update a guest (PUT) for the profile question; the create body contains prose and multiple examples. The first valid JSON example is retained for code generation, with a blocking review guard.
- Live OpenAI calls and live AI-key Keychain storage were not tested because no user API key was supplied. The optional integration is verified through request-contract/response-parser tests only.
- Final native UI verified the profile workflow against the saved 449-request workspace, correct POST/PUT endpoints, the ambiguous-body review note, required variables, and switching between Python and TypeScript. Visually checked dark-theme code readability. Workspace item counts remained unchanged.
- Release macOS bundle rebuilt, copied to release/Requestbench.app, ad-hoc signed, and verified with codesign --verify --deep --strict. ZIP refreshed. No real API requests or cloud AI calls were made during UI verification.

## 0.4.0 — visual workflow builder

- Added a draggable node canvas, sequence connectors, zoom/arrange controls, category/API picker, and step inspector for request templates, payloads, captured responses, imported examples, and manually selected fixtures.
- Reordering steps updates the existing deterministic code generator; removal leaves saved requests untouched.
- Added regression coverage for Postman response-example preservation through export/import, source labels and missing responses, malformed sample data, and sequence changes reaching generated code without mutation of saved requests.
- No new API execution path was added. Actual results come from the existing editor's in-memory result map; they are labeled as potentially belonging to an earlier request configuration.
- 22 TypeScript regression cases passed across the full suite and focused rerun after correcting a test fixture's missing Postman schema. Production TypeScript/Vite and native macOS builds passed.
- Native UI verified create/update graph, payload inspection, no-response state, fit/zoom, step reordering and matching code-generation order. A screenshot confirmed dragging the update node changes its position and redraws the connector.
- Startup accessibility initially timed out; a screenshot and subsequent native interaction confirmed the app was running and responsive. Both target and delivered bundles were ad-hoc signed and passed strict codesign verification; release ZIP refreshed.
- User workspace counts remain 449 requests, 4 environments, and 2 fixtures. No user APIs or OpenAI requests were executed. Live-response display is covered by data-source tests; this UI pass inspected the no-response state rather than sending a real request.

## 0.4.1 — OpenAI progress and failure feedback

- Added separate working, success, no-match, and failure states. Working feedback includes spinner, indeterminate activity bar, elapsed time, model/context count, and a 30-second longer-wait notice. Duplicate requests are blocked with an immediate in-flight guard.
- Failure classification covers HTTP authentication, access, rate/quota, server errors, network errors, timeout, and invalid workflow output. Retry retains the attempted goal/catalog/model; failed attempts preserve the existing plan. Backend timeout errors now distinguish the 90-second deadline from connection failures.
- All 25 frontend tests and 13 Rust tests passed. Render tests verify accessible working/error states, recovery controls, no-match completion, and status-code classification despite generic provider advice. Production frontend build passed.
- No live OpenAI request was made. Status views were tested through server-rendered component fixtures rather than a live provider failure or timed browser interaction.
- Native release build completed; target and delivered app bundles passed strict ad-hoc signature verification. Release ZIP refreshed. Restart Requestbench to load 0.4.1.

## 0.5.0 — projects and product-friendly API explorer

- Project storage uses dedicated projects and project_history tables with explicit project IDs on every workspace save/load and history read/write. Migration copies the original workspace/history transactionally once and retains legacy tables. Existing environment IDs/secret markers are preserved.
- Project create, rename/describe, archive, restore, and save-before-switch are implemented. Switching is blocked during active requests, imports, and OpenAI planning. Archived projects retain all data.
- Product-facing overview includes capability groups, search, import guidance, and glossary. API exploration shows source descriptions, inferred operation/effects, input field names/types without sample values, request-to-result diagrams, response status guidance, and engineering questions. Technical execution requires opening the editor; send shortcut is disabled in exploration mode.
- Added project-scoped workflow draft persistence and sidebar preferences. Draft restoration filters out removed endpoint IDs; live results and canvas positions are session-only.
- Frontend regression cases passed for observed input types, absence of sample values in exploration, qualified prose examples, empty-project guidance, and project-specific workflow draft recovery. Rust migration/isolation tests passed for exact legacy data preservation, idempotency, archive/restore retention, and independent history pruning.
- All 29 frontend tests and 16 Rust tests passed. Desktop packaging succeeded. Native UI verified project creation, an empty isolated project with zero activity, save-before-switch, archive/restore, and the preserved 449-API / 4-environment / 2-example workspace. The empty verification project was left archived.
- Native inspection found an existing startup Keychain lookup blocking the UI after the app signature changed. Removed automatic credential access from project opening and moved explicit AI key check/save/delete operations to blocking workers. Re-tested opening the project successfully, without reading the saved key or granting a new Keychain permission.
- The migrated project JSON exactly matched the legacy workspace, and all 3 activity entries migrated. A timestamped SQLite backup was saved beside the existing database before migration. No user API calls or OpenAI requests were made during verification.
- Final signed build reopened successfully. Project counts and archive state survived restart. Visually checked the API explainer, including source documentation, input/action/result diagram, and the separate technical-editor entry point. Navigation now resets to the top and long imported names wrap within capability cards.
- Release artifacts are in release/Requestbench.app and release/Requestbench-macOS-arm64.zip in the repository checkout. The older running app window was left intact to preserve its unsaved workflow; use version 0.5.0 for subsequent project edits.
