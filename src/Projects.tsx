import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  FolderOpen,
  Plus,
  ArrowRight,
  Archive,
  RotateCcw,
  Search,
  Layers,
} from "lucide-react";
import WorkspaceApp from "./App";
import { uid } from "./model";
export type Project = {
  id: string;
  name: string;
  description: string;
  archived: boolean;
  requestCount: number;
  environmentCount: number;
  fixtureCount: number;
};
export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]),
    [active, setActive] = useState<Project | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [showArchived, setShowArchived] = useState(false),
    [editing, setEditing] = useState<Project | "new" | null>(null),
    [name, setName] = useState(""),
    [description, setDescription] = useState("");
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [active?.id]);
  const beforeLeave = useRef<() => Promise<boolean>>(async () => true);
  async function refresh() {
    if (!isTauri()) {
      setError("Open the desktop app to manage your local projects.");
      setLoading(false);
      return;
    }
    try {
      setProjects(await invoke<Project[]>("list_projects"));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function home() {
    if (busy) return;
    await act(async () => {
      if (!(await beforeLeave.current())) return;
      setActive(null);
      await refresh();
    });
  }
  function edit(project: Project | "new") {
    setEditing(project);
    setName(project === "new" ? "" : project.name);
    setDescription(project === "new" ? "" : project.description);
  }
  if (active)
    return (
      <WorkspaceApp
        key={active.id}
        project={active}
        onManageProjects={() => void home()}
        registerBeforeLeave={(fn) => {
          beforeLeave.current = fn;
        }}
      />
    );
  const visible = projects.filter(
    (p) =>
      p.archived === showArchived &&
      `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="projects-home">
      <header className="projects-header">
        <div className="brand">
          <span className="brand-icon">
            <Layers size={22} />
          </span>
          Requestbench
        </div>
        <span className="hint">
          Your API knowledge hub · stored on this device
        </span>
      </header>
      <main className="projects-content">
        <div className="projects-intro">
          <div>
            <div className="eyebrow">UNDERSTAND WHAT YOUR PRODUCT CAN DO</div>
            <h1>Your projects, clearly connected.</h1>
            <p>
              Explore capabilities, understand the data, and map the customer
              journeys behind your APIs.
            </p>
          </div>
          <button
            className="primary"
            disabled={busy}
            onClick={() => edit("new")}
          >
            <Plus size={17} /> New project
          </button>
        </div>
        <div className="project-guide">
          <div>
            <span>01</span>
            <strong>Create a project</strong>
            <p>Keep each product or initiative in its own space.</p>
          </div>
          <div>
            <span>02</span>
            <strong>Bring your APIs</strong>
            <p>
              Import a Postman collection or Requestbench JSON file from your
              team.
            </p>
          </div>
          <div>
            <span>03</span>
            <strong>Explore & connect</strong>
            <p>
              Read plain-language summaries and turn capabilities into a visual
              workflow.
            </p>
          </div>
        </div>
        <div className="projects-controls">
          <label>
            <Search size={16} />
            <input
              aria-label="Find project"
              placeholder="Find a project…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            aria-pressed={!showArchived}
            onClick={() => setShowArchived(false)}
          >
            Active projects ({projects.filter((p) => !p.archived).length})
          </button>
          <button
            aria-pressed={showArchived}
            onClick={() => setShowArchived(true)}
          >
            Archived ({projects.filter((p) => p.archived).length})
          </button>
        </div>
        {error && (
          <div className="workflow-message" role="alert">
            {error}
            <button onClick={() => void refresh()}>Reload projects</button>
          </div>
        )}
        {loading ? (
          <p role="status">Loading your projects…</p>
        ) : (
          <div className="project-grid">
            {visible.map((p) => (
              <article className="project-card" key={p.id}>
                <FolderOpen size={24} />
                <h2>{p.name}</h2>
                <p>
                  {p.description ||
                    "A dedicated home for this product’s APIs and examples."}
                </p>
                <div className="project-counts">
                  <span>
                    <b>{p.requestCount}</b> APIs
                  </span>
                  <span>
                    <b>{p.environmentCount}</b> environments
                  </span>
                  <span>
                    <b>{p.fixtureCount}</b> examples
                  </span>
                </div>
                <div className="project-card-actions">
                  {p.archived ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await invoke("update_project", {
                            ...p,
                            archived: false,
                          });
                          await refresh();
                        })
                      }
                    >
                      <RotateCcw size={15} />
                      Restore
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => setActive(p)}
                    >
                      Explore project <ArrowRight size={15} />
                    </button>
                  )}
                  <button disabled={busy} onClick={() => edit(p)}>
                    Manage
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {!loading && !visible.length && (
          <div className="project-empty">
            <FolderOpen size={30} />
            <h2>
              {query
                ? "No projects match your search"
                : showArchived
                  ? "No archived projects"
                  : "Start with your first project"}
            </h2>
            <p>
              {showArchived
                ? "Archived projects stay on your device and can be restored."
                : "Create a project, then import the APIs you want to understand."}
            </p>
          </div>
        )}
        {editing && (
          <ProjectDialog
            onClose={() => {
              if (!busy) setEditing(null);
            }}
          >
            <h2>
              {editing === "new" ? "Create a project" : "Project details"}
            </h2>
            <p className="hint">Use a product name your team recognizes.</p>
            <label className="workflow-label">
              Project name
              <input
                autoFocus
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Customer experience"
              />
            </label>
            <label className="workflow-label">
              What is this project about?
              <textarea
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Understand account creation, booking, and loyalty journeys."
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <div className="workflow-toolbar">
              <button
                disabled={busy || !name.trim()}
                className="primary"
                onClick={() =>
                  void act(async () => {
                    if (editing === "new") {
                      await invoke("create_project", {
                        id: uid(),
                        name,
                        description,
                      });
                    } else
                      await invoke("update_project", {
                        id: editing.id,
                        name,
                        description,
                        archived: editing.archived,
                      });
                    await refresh();
                    setEditing(null);
                  })
                }
              >
                {busy
                  ? "Saving…"
                  : editing === "new"
                    ? "Create project"
                    : "Save details"}
              </button>
              <button disabled={busy} onClick={() => setEditing(null)}>
                Cancel
              </button>
              {editing !== "new" && !editing.archived && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await invoke("update_project", {
                        ...editing,
                        archived: true,
                      });
                      await refresh();
                      setEditing(null);
                    })
                  }
                >
                  <Archive size={15} /> Archive project
                </button>
              )}
            </div>
            {editing !== "new" && (
              <p className="hint">
                Archiving hides the project from your active list. Its APIs and
                data are kept, and you can restore it at any time.
              </p>
            )}
          </ProjectDialog>
        )}
      </main>
    </div>
  );
}

function ProjectDialog({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="project-dialog"
      aria-label="Project details"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
