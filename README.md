# GUIForge

A visual designer for desktop GUIs. Drag widgets onto a canvas, edit their
properties, and export clean, idiomatic source code for the framework of your
choice — Tkinter, CustomTkinter, PyQt6, Dear PyGui, or C++ Dear ImGui.

The defining constraint of the architecture: **the frontend contains no
framework-specific logic.** It renders its widget library, property inspector
and export menu from data the backend serves. Adding a widget type or a whole
new code generator requires no frontend change at all.

---

## Running locally

Two processes during development — the API and Vite's dev server.

```bash
cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

Then open <http://localhost:5173>. Vite proxies `/api` to port 8000.

### Single-process mode

Build the frontend and FastAPI will serve it from the same origin — this is how
it runs in production.

```bash
cd frontend && npm run build
```

```bash
cd backend && uvicorn main:app --port 8000
```

Everything is then on <http://localhost:8000>.

---

## Deploying

The app is one Python service that also serves the built frontend, so it needs
a host that runs Python — not a static host.

### Render (free tier)

`render.yaml` is a complete blueprint. Push this repo to GitHub, then on
[render.com](https://render.com) choose **New → Blueprint** and point it at the
repository. Render installs both toolchains, runs the frontend build, and starts
uvicorn.

Free instances sleep after ~15 minutes idle and take 30–60s to wake.

### Cloudflare Pages + a backend elsewhere

The frontend can live on a static host with the API on its own origin. Build it:

```bash
cd frontend && npm run build
```

Then upload `frontend/dist/` to Cloudflare Pages (**Create a project → Upload
assets**) and do two things:

1. Edit `config.json` in the uploaded folder to point at your backend:

   ```json
   { "apiBaseUrl": "https://guiforge-abcd.onrender.com" }
   ```

   It is read at page load and never cached, so changing the backend later
   means re-uploading that one file — no rebuild.

2. Set `GUIFORGE_ALLOWED_ORIGINS` on the backend to your Pages address, or the
   browser will block every request.

`_redirects` and `_headers` are included in the build and handle SPA routing and
cache policy. `frontend/public/READ-ME-FIRST.txt` ships alongside them with the
same instructions for whoever does the upload.

Note this is **two** deployments rather than one — the backend is still
required. Prefer the single-service setup unless you specifically want
Cloudflare's CDN or a domain you already host there.

### Docker (Fly.io, Railway, Cloud Run, any VPS)

```bash
docker build -t guiforge .
```

```bash
docker run -p 8000:8000 guiforge
```

### Environment variables

**Backend**

| Variable | Purpose | Default |
| --- | --- | --- |
| `GUIFORGE_FRONTEND_DIST` | Path to the built frontend | `../frontend/dist` |
| `GUIFORGE_ALLOWED_ORIGINS` | Comma-separated CORS origins | the Vite dev server |
| `PORT` | Listen port | `8000` |

**Frontend**

| Variable | Purpose | Default |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Build-time backend URL | same origin (`/api`) |

The backend URL resolves in this order: `config.json` at runtime →
`VITE_API_BASE_URL` at build time → same origin. CORS only matters when the
frontend is served from a different origin than the API; in the single-service
deployment it is irrelevant.

### Note on the code editor

Monaco is loaded from the jsDelivr CDN at runtime rather than bundled — it keeps
the app bundle at ~285 kB instead of ~5 MB. The consequence is that the
Generated Code panel needs network access to that CDN. Everything else works
offline.

---

## Architecture

```
backend/
  models/           schema (versioned), widget catalog, migrations
  generators/       one self-contained module per framework
    shared/         CodeWriter, naming, colour, tree visitor
    tkinter/  customtkinter/  pyqt6/  dearpygui/  imgui_cpp/
  services/         templates, validation, export packaging
  api/              REST layer
  plugins/          drop-in extensions

frontend/src/
  types/            TypeScript mirrors of the document format
  store/            Zustand: document + history, UI state, catalog
  lib/              tree ops, geometry/snapping, commands, persistence
  components/       canvas, library, inspector, panels, dialogs
```

### The API contract

| Endpoint | Purpose |
| --- | --- |
| `GET /api/catalog` | Every widget type, its properties and its events |
| `GET /api/generators` | Every framework, implemented or planned |
| `GET /api/templates` | Starter projects |
| `POST /api/generate` | Project → source files (drives the live code panel) |
| `POST /api/validate` | Project → errors, accessibility issues, statistics |
| `POST /api/export` | Project → downloadable artifact |
| `POST /api/projects/load` | Migrate a document to the current schema |

The frontend never learns what a "Tkinter" is; it renders whatever these
endpoints describe.

---

## Adding a code generator

Create `backend/generators/<name>/generator.py`, subclass `CodeGenerator`, and
decorate it with `@registry.register`. Discovery is automatic — no core file is
edited, and the new framework appears in the export menu on next start.

```python
@registry.register
class MyGenerator(CodeGenerator):
    info = GeneratorInfo(
        id="myframework", label="My Framework", language="python",
        language_label="Python", extension=".py",
    )

    def generate(self, project: Project) -> list[GeneratedFile]:
        writer = CodeWriter()
        ...
        return [GeneratedFile("main.py", writer.render())]
```

Subclass `WidgetVisitor` to get per-widget dispatch (`emit_button`,
`emit_label`, …) with a graceful fallback for types you have not implemented —
that fallback is why a generator never breaks when the catalog grows.

The test suite parametrises over the registry, so a new generator is
automatically covered against every template and every widget type the moment it
is registered.

## Adding a widget type

Append a `WidgetSpec` to `backend/models/catalog.py` (or register one from a
plugin). It appears in the library, the inspector and the canvas immediately.
Generators that do not know it emit a commented placeholder and a diagnostic
rather than failing.

## Plugins

Drop a package into `backend/plugins/` exposing `register(context)`:

```python
def register(context):
    context.add_widget(WidgetSpec(type="gauge", label="Gauge", ...))
    context.add_generator(MyGenerator)
    context.add_template("dial-demo", build_dial_demo)
```

A plugin that raises during registration is skipped with a logged message; one
bad plugin never stops the app from starting.

---

## Tests

```bash
cd backend && python -m pytest
```

315 tests. The important ones are contract tests: every generator must handle
every template and every widget type without raising, and Python generators must
emit source that actually compiles (`compile()` is called on the output).

```bash
cd frontend && npm run typecheck
```

---

## Keyboard shortcuts

| | |
| --- | --- |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+N` / `O` / `S` | New / Open / Save |
| `Ctrl+E` | Export |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `Ctrl+C` / `X` / `V` / `D` | Copy / Cut / Paste / Duplicate |
| `Ctrl+G` / `Ctrl+Shift+G` | Group / Ungroup |
| `Ctrl+[` / `Ctrl+]` | Send backward / Bring forward |
| `Ctrl+L` / `Ctrl+H` | Lock / Hide |
| Arrows | Nudge (`Shift` for a coarse nudge) |
| `P` | Live preview |
| `Space` + drag | Pan |
| `Ctrl` + wheel | Zoom at cursor |
| `Alt` + click | Select through a container |
