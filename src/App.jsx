import { useState, useEffect, useMemo, useRef } from "react";
import "./components/style.css";

/* ---------- storage keys ---------- */
const NOTES_KEY = "notes-v2";
const NOTEBOOKS_KEY = "notebooks-v2";
const THEME_KEY = "notes-theme";

/* ---------- small helpers ---------- */
const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Turn the note's HTML into plain text (used for search, preview, tags, word count)
const toText = (html) => {
  const div = document.createElement("div");
  div.innerHTML = html.replace(
    /<\/(p|div|h[1-6]|li|pre|blockquote)>|<br\s*\/?>/gi,
    " $&"
  );
  return div.textContent || "";
};

const formatDate = (ms) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

// Load notes. If the old app's "notes" exist, convert them to the new shape.
function loadNotes() {
  try {
    const saved = localStorage.getItem(NOTES_KEY);
    if (saved) return JSON.parse(saved);

    const old = localStorage.getItem("notes");
    if (old) {
      return JSON.parse(old).map((n) => ({
        id: n.id,
        title: n.title,
        html: "<p>" + escapeHtml(n.content).replace(/\n/g, "<br>") + "</p>",
        notebook: null,
        pinned: false,
        trashed: false,
        createdAt: n.id,
        updatedAt: n.id,
      }));
    }
  } catch {
    /* ignore corrupted storage */
  }
  return [];
}

/* ---------- icons (simple inline SVG) ---------- */
const ICONS = {
  notes:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  pin: "M12 17v5 M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z",
  trash:
    "M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M10 11v6 M14 11v6",
  plus: "M12 5v14 M5 12h14",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  hash: "M4 9h16 M4 15h16 M10 3L8 21 M16 3l-2 18",
  moon: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42",
  focus:
    "M8 3H5a2 2 0 0 0-2 2v3 M21 8V5a2 2 0 0 0-2-2h-3 M3 16v3a2 2 0 0 0 2 2h3 M16 21h3a2 2 0 0 0 2-2v-3",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35",
  back: "M19 12H5 M12 19l-7-7 7-7",
  restore: "M1 4v6h6 M3.51 15a9 9 0 1 0 2.13-9.36L1 10",
};

function Icon({ name, size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/* ---------- sidebar row ---------- */
function NavItem({ icon, label, count, active, onClick, onRemove }) {
  return (
    <div className={"nav-item" + (active ? " active" : "")}>
      <button className="nav-main" onClick={onClick}>
        <Icon name={icon} />
        <span className="nav-label">{label}</span>
        {count > 0 && <span className="count">{count}</span>}
      </button>
      {onRemove && (
        <button className="nav-remove" title="Delete notebook" onClick={onRemove}>
          ×
        </button>
      )}
    </div>
  );
}

/* ---------- the editor (title + rich text body) ---------- */
function Editor({
  note,
  notebooks,
  focus,
  onChange,
  onTogglePin,
  onTrash,
  onRestore,
  onPurge,
  onToggleFocus,
  onBack,
}) {
  const bodyRef = useRef(null);

  // Put the saved HTML into the editor once when this note is opened.
  useEffect(() => {
    bodyRef.current.innerHTML = note.html;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sync = () => onChange(note.id, { html: bodyRef.current.innerHTML });

  const run = (cmd, value) => {
    bodyRef.current.focus();
    document.execCommand(cmd, false, value);
    sync();
  };

  // headings / quote / code toggle back to a normal paragraph if already applied
  const block = (tag) => {
    const current = (document.queryCommandValue("formatBlock") || "").toLowerCase();
    run("formatBlock", current === tag ? "<p>" : `<${tag}>`);
  };

  const addLink = () => {
    const url = window.prompt("Link address (https://…)");
    if (url) run("createLink", url);
  };

  const tools = [
    { label: "B", title: "Bold (Ctrl+B)", className: "t-bold", action: () => run("bold") },
    { label: "I", title: "Italic (Ctrl+I)", className: "t-italic", action: () => run("italic") },
    { label: "U", title: "Underline (Ctrl+U)", className: "t-underline", action: () => run("underline") },
    { label: "S", title: "Strikethrough", className: "t-strike", action: () => run("strikeThrough") },
    { label: "H", title: "Heading", action: () => block("h2") },
    { label: "•", title: "Bullet list", action: () => run("insertUnorderedList") },
    { label: "1.", title: "Numbered list", action: () => run("insertOrderedList") },
    { label: "❝", title: "Quote", action: () => block("blockquote") },
    { label: "</>", title: "Code block", action: () => block("pre") },
    { label: "Mark", title: "Highlight", className: "t-mark", action: () => run("hiliteColor", "#fde68a") },
    { label: "Link", title: "Insert link", action: addLink },
    { label: "—", title: "Divider", action: () => run("insertHorizontalRule") },
  ];

  const text = toText(note.html).trim();
  const words = text ? text.split(/\s+/).length : 0;

  return (
    <section className="editor">
      <header className="editor-top">
        <button className="icon-btn back-btn" onClick={onBack} title="Back to notes">
          <Icon name="back" />
        </button>

        {!note.trashed && (
          <select
            className="nb-select"
            value={note.notebook || ""}
            onChange={(e) => onChange(note.id, { notebook: e.target.value || null }, false)}
            title="Move to notebook"
          >
            <option value="">No notebook</option>
            {notebooks.map((nb) => (
              <option key={nb} value={nb}>
                {nb}
              </option>
            ))}
          </select>
        )}

        <div className="spacer" />

        {note.trashed ? (
          <>
            <button className="text-btn" onClick={onRestore}>
              <Icon name="restore" /> Restore
            </button>
            <button className="text-btn danger" onClick={onPurge}>
              Delete forever
            </button>
          </>
        ) : (
          <>
            <button
              className={"icon-btn" + (note.pinned ? " on" : "")}
              onClick={onTogglePin}
              title={note.pinned ? "Unpin" : "Pin to top"}
            >
              <Icon name="pin" />
            </button>
            <button
              className={"icon-btn" + (focus ? " on" : "")}
              onClick={onToggleFocus}
              title={focus ? "Exit focus mode (Esc)" : "Focus mode"}
            >
              <Icon name="focus" />
            </button>
            <button className="icon-btn" onClick={onTrash} title="Move to trash">
              <Icon name="trash" />
            </button>
          </>
        )}
      </header>

      {!note.trashed && (
        <div className="toolbar">
          {tools.map((t) => (
            <button
              key={t.title}
              type="button"
              title={t.title}
              className={"tool " + (t.className || "")}
              // keep the text selection in the editor when clicking a button
              onMouseDown={(e) => {
                e.preventDefault();
                t.action();
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="editor-scroll">
        <div className="editor-page">
          <input
            className="title-input"
            placeholder="Title"
            value={note.title}
            readOnly={note.trashed}
            autoFocus={!note.title && !note.html}
            onChange={(e) => onChange(note.id, { title: e.target.value })}
          />
          <div
            ref={bodyRef}
            className="body-input"
            contentEditable={!note.trashed}
            suppressContentEditableWarning
            data-placeholder="Start writing… use #tags to organize"
            onInput={sync}
            onPaste={(e) => {
              // paste as plain text so we don't bring in messy styles
              e.preventDefault();
              const plain = e.clipboardData.getData("text/plain");
              document.execCommand("insertText", false, plain);
            }}
          />
        </div>
      </div>

      <footer className="editor-foot">
        {words} {words === 1 ? "word" : "words"}
        <span>Edited {formatDate(note.updatedAt)}</span>
      </footer>
    </section>
  );
}

/* ---------- the app ---------- */
function App() {
  const [notes, setNotes] = useState(loadNotes);
  const [notebooks, setNotebooks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(NOTEBOOKS_KEY)) || [];
    } catch {
      return [];
    }
  });
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "light");

  const [view, setView] = useState("all"); 
  const [activeId, setActiveId] = useState(null);
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState(false);
  const [showEditor, setShowEditor] = useState(false); // small screens only
  const [addingNb, setAddingNb] = useState(false);
  const [nbName, setNbName] = useState("");

  /* save to localStorage whenever things change */
  useEffect(() => {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    localStorage.setItem(NOTEBOOKS_KEY, JSON.stringify(notebooks));
  }, [notebooks]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  /* Esc leaves focus mode */
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setFocus(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* add plain text + #tags to each note */
  const meta = useMemo(
    () =>
      notes.map((n) => {
        const text = toText(n.html);
        const tags = [
          ...new Set(
            [...text.matchAll(/(?:^|\s)#([\p{L}\d_-]+)/gu)].map((m) => m[1].toLowerCase())
          ),
        ];
        return { ...n, text, tags };
      }),
    [notes]
  );

  /* which notes show in the middle list */
  const q = search.trim().toLowerCase();

  const visible = meta
    .filter((n) => {
      if (view === "trash") {
        if (!n.trashed) return false;
      } else {
        if (n.trashed) return false;
        if (view === "pinned" && !n.pinned) return false;
        if (view.startsWith("nb:") && n.notebook !== view.slice(3)) return false;
        if (view.startsWith("tag:") && !n.tags.includes(view.slice(4))) return false;
      }
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.text.toLowerCase().includes(q) ||
        n.tags.some((t) => t.includes(q.replace(/^#/, "")))
      );
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);

  const active = visible.find((n) => n.id === activeId) || visible[0] || null;

  /* sidebar counts */
  const live = meta.filter((n) => !n.trashed);
  const counts = {
    all: live.length,
    pinned: live.filter((n) => n.pinned).length,
    trash: meta.length - live.length,
  };
  const tagCounts = {};
  live.forEach((n) => n.tags.forEach((t) => (tagCounts[t] = (tagCounts[t] || 0) + 1)));
  const tagList = Object.keys(tagCounts).sort();

  const viewTitle = view.startsWith("nb:")
    ? view.slice(3)
    : view.startsWith("tag:")
    ? "#" + view.slice(4)
    : { all: "All notes", pinned: "Pinned", trash: "Trash" }[view];

  /* ----- actions ----- */
  function updateNote(id, patch, touch = true) {
    setNotes((ns) =>
      ns.map((n) =>
        n.id === id ? { ...n, ...patch, ...(touch ? { updatedAt: Date.now() } : {}) } : n
      )
    );
  }

  function newNote() {
    const now = Date.now();
    const note = {
      id: now,
      title: "",
      html: "",
      notebook: view.startsWith("nb:") ? view.slice(3) : null,
      pinned: view === "pinned",
      trashed: false,
      createdAt: now,
      updatedAt: now,
    };
    setNotes((ns) => [note, ...ns]);
    if (view === "trash" || view.startsWith("tag:")) setView("all");
    setSearch("");
    setActiveId(now);
    setShowEditor(true);
  }

  function purge(id) {
    if (window.confirm("Delete this note forever? This can't be undone.")) {
      setNotes((ns) => ns.filter((n) => n.id !== id));
    }
  }

  function emptyTrash() {
    if (window.confirm("Delete everything in the trash forever?")) {
      setNotes((ns) => ns.filter((n) => !n.trashed));
    }
  }

  function addNotebook() {
    const name = nbName.trim();
    if (name && !notebooks.includes(name)) setNotebooks([...notebooks, name]);
    setNbName("");
    setAddingNb(false);
  }

  function removeNotebook(name) {
    if (!window.confirm(`Delete the notebook "${name}"? Its notes will be kept.`)) return;
    setNotebooks(notebooks.filter((nb) => nb !== name));
    setNotes((ns) => ns.map((n) => (n.notebook === name ? { ...n, notebook: null } : n)));
    if (view === "nb:" + name) setView("all");
  }

  function pickView(v) {
    setView(v);
    setSearch("");
    setShowEditor(false);
  }

  /* ----- render ----- */
  return (
    <div className={"app" + (focus ? " focus" : "") + (showEditor ? " show-editor" : "")}>
      {/* LEFT: sidebar */}
      <aside className="sidebar">
        <div className="brand">Notes</div>

        <button className="new-btn" onClick={newNote}>
          <Icon name="plus" /> New note
        </button>

        <nav>
          <NavItem icon="notes" label="All notes" count={counts.all} active={view === "all"} onClick={() => pickView("all")} />
          <NavItem icon="pin" label="Pinned" count={counts.pinned} active={view === "pinned"} onClick={() => pickView("pinned")} />
          <NavItem icon="trash" label="Trash" count={counts.trash} active={view === "trash"} onClick={() => pickView("trash")} />
        </nav>

        <div className="section-head">
          <span>Notebooks</span>
          <button className="icon-btn small" title="New notebook" onClick={() => setAddingNb(true)}>
            <Icon name="plus" size={14} />
          </button>
        </div>
        <nav>
          {notebooks.map((nb) => (
            <NavItem
              key={nb}
              icon="book"
              label={nb}
              count={live.filter((n) => n.notebook === nb).length}
              active={view === "nb:" + nb}
              onClick={() => pickView("nb:" + nb)}
              onRemove={() => removeNotebook(nb)}
            />
          ))}
          {addingNb && (
            <input
              className="nb-input"
              autoFocus
              placeholder="Notebook name"
              value={nbName}
              onChange={(e) => setNbName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addNotebook();
                if (e.key === "Escape") {
                  setAddingNb(false);
                  setNbName("");
                }
              }}
              onBlur={addNotebook}
            />
          )}
          {notebooks.length === 0 && !addingNb && (
            <p className="hint">Group related notes into notebooks.</p>
          )}
        </nav>

        <div className="section-head">
          <span>Tags</span>
        </div>
        <nav className="tags-nav">
          {tagList.map((t) => (
            <NavItem
              key={t}
              icon="hash"
              label={t}
              count={tagCounts[t]}
              active={view === "tag:" + t}
              onClick={() => pickView("tag:" + t)}
            />
          ))}
          {tagList.length === 0 && <p className="hint">Type #idea in a note to create a tag.</p>}
        </nav>

        <div className="sidebar-foot">
          <button className="text-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            <Icon name={theme === "dark" ? "sun" : "moon"} />
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </aside>

      {/* MIDDLE: note list */}
      <section className="list-pane">
        <header className="list-head">
          <div className="list-title-row">
            <h2>{viewTitle}</h2>
            <span className="list-count">{visible.length}</span>
            <div className="spacer" />
            {view === "trash" && visible.length > 0 && (
              <button className="text-btn danger" onClick={emptyTrash}>
                Empty trash
              </button>
            )}
            <button className="icon-btn mobile-only" onClick={newNote} title="New note">
              <Icon name="plus" />
            </button>
          </div>

          {/* small screens: no sidebar, so switch views here */}
          <select className="view-select" value={view} onChange={(e) => pickView(e.target.value)}>
            <option value="all">All notes</option>
            <option value="pinned">Pinned</option>
            {notebooks.map((nb) => (
              <option key={nb} value={"nb:" + nb}>
                Notebook: {nb}
              </option>
            ))}
            {tagList.map((t) => (
              <option key={t} value={"tag:" + t}>
                #{t}
              </option>
            ))}
            <option value="trash">Trash</option>
          </select>

          <label className="search">
            <Icon name="search" size={15} />
            <input
              type="text"
              placeholder="Search notes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </header>

        <div className="list-scroll">
          {visible.length === 0 ? (
            <p className="empty">
              {q
                ? "No notes match your search."
                : view === "trash"
                ? "Trash is empty."
                : "No notes here yet. Select New note to start writing."}
            </p>
          ) : (
            visible.map((n) => (
              <button
                key={n.id}
                className={"note-card" + (active && n.id === active.id ? " selected" : "")}
                onClick={() => {
                  setActiveId(n.id);
                  setShowEditor(true);
                }}
              >
                <span className="card-title">
                  {n.pinned && <Icon name="pin" size={12} />}
                  {n.title.trim() || "Untitled"}
                </span>
                <span className="card-preview">{n.text.trim().slice(0, 110) || "No content"}</span>
                <span className="card-meta">
                  {formatDate(n.updatedAt)}
                  {n.notebook && <span className="chip">{n.notebook}</span>}
                  {n.tags.slice(0, 2).map((t) => (
                    <span className="chip tag" key={t}>
                      #{t}
                    </span>
                  ))}
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      {/* RIGHT: editor */}
      {active ? (
        <Editor
          key={active.id}
          note={active}
          notebooks={notebooks}
          focus={focus}
          onChange={updateNote}
          onTogglePin={() => updateNote(active.id, { pinned: !active.pinned }, false)}
          onTrash={() => updateNote(active.id, { trashed: true, pinned: false }, false)}
          onRestore={() => updateNote(active.id, { trashed: false }, false)}
          onPurge={() => purge(active.id)}
          onToggleFocus={() => setFocus(!focus)}
          onBack={() => setShowEditor(false)}
        />
      ) : (
        <section className="editor empty-editor">
          <p>Select a note, or create a new one.</p>
        </section>
      )}
    </div>
  );
}

export default App;