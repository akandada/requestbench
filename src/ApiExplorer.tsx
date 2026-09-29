import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Compass,
  FileJson,
  Workflow,
} from "lucide-react";
import type { RequestItem, ResponseData, Workspace } from "./model";
import type { Project } from "./Projects";
import { describeAction, inputFields, plainDescription } from "./api-explainer";
import { responseExamples } from "./workflow-inspector";
export function ProjectOverview({
  project,
  workspace,
  onOpen,
  onImport,
  onWorkflow,
}: {
  project: Project;
  workspace: Workspace;
  onOpen: (id: string) => void;
  onImport: () => void;
  onWorkflow: () => void;
}) {
  const [query, setQuery] = useState("");
  const groups = new Map<string, RequestItem[]>();
  for (const r of workspace.requests) {
    const parts = r.folder.split(" / ");
    const category = parts.length > 1 ? parts[1] : r.folder || "Other APIs";
    groups.set(category, [...(groups.get(category) ?? []), r]);
  }
  const matches = workspace.requests.filter((r) =>
    `${r.name} ${r.folder}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="project-overview">
      <div className="eyebrow">PROJECT OVERVIEW</div>
      <h1>{project.name}</h1>
      <p className="overview-description">
        {project.description ||
          "Get to know the capabilities behind your product."}
      </p>
      <div className="overview-stats">
        <div>
          <b>{workspace.requests.length}</b>
          <span>APIs to explore</span>
        </div>
        <div>
          <b>{groups.size}</b>
          <span>capability groups</span>
        </div>
        <div>
          <b>{workspace.fixtures.length}</b>
          <span>saved data examples</span>
        </div>
      </div>
      <div className="overview-next">
        <BookOpen size={23} />
        <div>
          <strong>Start with a question, not a request.</strong>
          <p>
            For example: “How do we create and update a customer profile?”
            Explore a capability below, or ask the workflow assistant to connect
            the relevant APIs.
          </p>
        </div>
        <button onClick={onWorkflow}>
          Map a journey <ArrowRight size={15} />
        </button>
      </div>
      <div className="overview-section-title">
        <h2>What can this project do?</h2>
        <button onClick={onImport}>
          <FileJson size={15} /> Import APIs
        </button>
      </div>
      <input
        className="capability-search"
        aria-label="Find a capability"
        placeholder="Find a capability, such as guests, bookings, or payments…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!workspace.requests.length ? (
        <div className="project-empty">
          <Compass size={32} />
          <h2>Bring your product’s capabilities into view</h2>
          <p>
            Ask your engineering team for a Postman collection or a Requestbench
            JSON export, then import it here. It stays in this project.
          </p>
          <button className="primary" onClick={onImport}>
            Import your first collection
          </button>
        </div>
      ) : query ? (
        <div className="capability-results">
          {matches.slice(0, 100).map((r) => (
            <button key={r.id} onClick={() => onOpen(r.id)}>
              <span>
                <strong>{r.name}</strong>
                <small>{r.folder}</small>
              </span>
              <span>{describeAction(r).label} →</span>
            </button>
          ))}
          {!matches.length && (
            <p>No matching capabilities. Try a name from your collection.</p>
          )}
          {matches.length > 100 && (
            <p>Showing the first 100 matches. Refine your search for more.</p>
          )}
        </div>
      ) : (
        <div className="capability-grid">
          {[...groups].map(([name, items]) => (
            <article key={name}>
              <Workflow size={20} />
              <h3>{name}</h3>
              <p>
                {items.length} APIs ·{" "}
                {new Set(items.map((r) => describeAction(r).label)).size} kinds
                of operation
              </p>
              {items.slice(0, 3).map((r) => (
                <button key={r.id} onClick={() => onOpen(r.id)}>
                  {r.name}
                  <ArrowRight size={13} />
                </button>
              ))}
              {items.length > 3 && (
                <button className="text-button" onClick={() => setQuery(name)}>
                  Explore all {items.length} APIs →
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      <div className="api-glossary">
        <h2>A few useful terms</h2>
        <dl>
          <div>
            <dt>API</dt>
            <dd>
              A capability one system makes available to another, such as
              finding a guest or making a booking.
            </dd>
          </div>
          <div>
            <dt>Request</dt>
            <dd>
              The question or action sent to the service, together with any
              information it needs.
            </dd>
          </div>
          <div>
            <dt>Response</dt>
            <dd>The information or confirmation returned by the service.</dd>
          </div>
          <div>
            <dt>Environment</dt>
            <dd>
              The destination and settings used when trying an API, such as a
              test system or production.
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
export function ApiExplainer({
  request,
  response,
  onTechnical,
  onWorkflow,
}: {
  request: RequestItem;
  response?: ResponseData;
  onTechnical: () => void;
  onWorkflow: () => void;
}) {
  const action = describeAction(request),
    description = plainDescription(request),
    inputs = inputFields(request),
    examples = responseExamples(request);
  const variables = [
    ...new Set(
      [...request.url.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m) => m[1]),
    ),
  ];
  return (
    <section className="api-explainer">
      <div className="eyebrow">UNDERSTAND THIS API</div>
      <div className="explainer-heading">
        <div>
          <h1>{request.name}</h1>
          <p className="hint">{request.folder || "Not grouped yet"}</p>
        </div>
        <span className="action-pill">{action.label}</span>
      </div>
      <div className="explainer-summary">
        <h2>What does it do?</h2>
        <p>{action.summary}</p>
        {description ? (
          <details open>
            <summary>From the imported documentation</summary>
            <p>{description}</p>
          </details>
        ) : (
          <p className="hint">
            No description was included in the collection. This overview is
            inferred from the request method and saved examples, not a verified
            business specification.
          </p>
        )}
        <p className="impact-note">{action.impact}</p>
      </div>
      <div className="api-story">
        <div>
          <span>1 · YOU PROVIDE</span>
          <h3>Inputs</h3>
          <p>
            {inputs.fields.length
              ? `${inputs.fields.length}${inputs.fields.length === 60 ? "+" : ""} fields found in the saved body example`
              : "No structured body fields found"}
          </p>
          {variables.length > 0 && <p>URL values: {variables.join(", ")}</p>}
        </div>
        <ArrowRight size={20} />
        <div>
          <span>2 · THE SERVICE</span>
          <h3>{action.label}</h3>
          <p>{request.name}</p>
        </div>
        <ArrowRight size={20} />
        <div>
          <span>3 · YOU RECEIVE</span>
          <h3>Result</h3>
          <p>
            {response
              ? `Last result: HTTP ${response.status}`
              : examples.length
                ? `${examples.length} documented response examples`
                : "No response example available yet"}
          </p>
        </div>
      </div>
      <div className="explainer-columns">
        <section>
          <h2>Information this API accepts</h2>
          <p className="hint">
            Fields observed in an example; required fields and validation rules
            are not known.
            {inputs.exampleOnly
              ? " The saved body includes prose or multiple examples."
              : ""}
          </p>
          {inputs.fields.length ? (
            <table>
              <thead>
                <tr>
                  <th>Information</th>
                  <th>Kind of value</th>
                </tr>
              </thead>
              <tbody>
                {inputs.fields.map((f) => (
                  <tr key={f.path}>
                    <td>
                      {f.label}
                      <small>{f.path}</small>
                    </td>
                    <td>{f.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>
              Check the request documentation with your engineering team for its
              inputs.
            </p>
          )}
        </section>
        <section>
          <h2>How to interpret the result</h2>
          {response ? (
            <p>
              The last call returned{" "}
              <strong>
                {response.status} {response.statusText}
              </strong>{" "}
              in {response.duration} ms. This result may predate changes to the
              request.
            </p>
          ) : (
            <p>
              This API has not been called in this project session. Exploring
              this page does not send a request.
            </p>
          )}
          <ul className="result-guide">
            <li>
              <b>2xx · Completed</b>
              <span>The service accepted or completed the request.</span>
            </li>
            <li>
              <b>4xx · Request needs attention</b>
              <span>Check the inputs, permissions, or record identifier.</span>
            </li>
            <li>
              <b>5xx · Service issue</b>
              <span>The service could not complete the request.</span>
            </li>
          </ul>
          <h3>Questions to confirm with engineering</h3>
          <ul>
            <li>Which fields are required?</li>
            <li>What permissions does this action need?</li>
            <li>What does a successful response contain?</li>
            <li>Can this be tried safely in a test environment?</li>
          </ul>
          <button onClick={onWorkflow}>Explore a connected workflow</button>
        </section>
      </div>
      <div className="overview-next">
        <div>
          <strong>Need the exact technical details?</strong>
          <p>
            View the URL, headers, payload, and full response in the request
            editor. Sending a request can affect the connected system.
          </p>
        </div>
        <button onClick={onTechnical}>
          Open technical editor <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}
