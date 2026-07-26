"""Tkinter code generator.

Emits a single-file application built around a `tk.Tk` subclass. Design goals,
in priority order:

1. The output looks like code a competent Python developer would write by hand.
2. Each container gets its own `_build_*` method, so deep layouts stay readable
   instead of collapsing into one thousand-line constructor.
3. `ttk` is preferred wherever it gives the better-looking native control, with
   plain `tk` used only where `ttk` has no equivalent.
"""

from __future__ import annotations

from generators.base import CodeGenerator, GeneratedFile, GeneratorInfo, registry
from generators.shared import CodeWriter, WidgetVisitor, py_string, snake, to_hex
from generators.shared.visitor import collect_event_handlers
from models.schema import Project, Widget


class _TkVisitor(WidgetVisitor):
    """Walks the widget tree emitting Tkinter construction code.

    Container widgets are deferred: the visitor records them and emits a
    dedicated `_build_<name>` method for each, which is what keeps generated
    functions short.
    """

    supported = {
        "frame", "group", "panel", "tabs", "scrollArea", "splitter",
        "textbox", "passwordBox", "multilineText", "numberInput", "slider",
        "checkbox", "radioButton", "comboBox", "colorPicker", "datePicker",
        "button", "toggleButton", "iconButton",
        "label", "image", "progressBar", "spinner", "separator", "table", "treeView",
        "menuBar", "toolbar", "statusBar", "sidebar", "canvas",
        "markdownViewer", "openGLView", "webView",
    }

    def __init__(self, generator: "TkinterGenerator") -> None:
        super().__init__()
        self.gen = generator
        self.body = CodeWriter()
        self.deferred: list[tuple[Widget, str]] = []
        self.variables: list[tuple[str, str, str]] = []  # (var, tk type, initial)
        self.needs_ttk = False
        self.needs_font = False

    # -- placement ----------------------------------------------------------

    def _place(self, widget: Widget, var: str) -> None:
        pos, size = widget.layout.position, widget.layout.size
        self.body.line(
            f"self.{var}.place("
            f"x={int(pos.x)}, y={int(pos.y)}, "
            f"width={int(size.width)}, height={int(size.height)})"
        )
        if not widget.behavior.visible:
            self.body.line(f"self.{var}.place_forget()  # hidden in designer")
        if not widget.behavior.enabled:
            self.body.line(f"self.{var}.configure(state='disabled')")
        self.body.blank()

    def _style_args(self, widget: Widget, *, text_color: bool = True) -> list[str]:
        """Common styling keywords accepted by classic `tk` widgets."""
        args: list[str] = []
        appearance = widget.appearance
        if bg := to_hex(appearance.background):
            args.append(f"bg={py_string(bg)}")
        if text_color and (fg := to_hex(appearance.color)):
            args.append(f"fg={py_string(fg)}")
        if font := self._font(widget):
            args.append(f"font={font}")
        if appearance.border_width:
            args.append(f"bd={int(appearance.border_width)}")
        return args

    def _font(self, widget: Widget) -> str | None:
        font = widget.appearance.font
        if font.family == "Segoe UI" and font.size == 12 and font.weight == "normal" \
                and font.style == "normal" and not font.underline:
            return None
        self.needs_font = True
        parts = [py_string(font.family), str(font.size)]
        modifiers = " ".join(
            m for m, on in (("bold", font.weight == "bold"),
                            ("italic", font.style == "italic"),
                            ("underline", font.underline)) if on
        )
        if modifiers:
            parts.append(py_string(modifiers))
        return f"({', '.join(parts)})"

    def _command(self, widget: Widget, event: str = "click") -> str | None:
        handler = widget.events.get(event)
        return f"command=self.{snake(handler, 'on_event')}" if handler else None

    def _bindings(self, widget: Widget, var: str) -> None:
        """Events Tk exposes through `bind` rather than a `command` keyword."""
        sequences = {
            "doubleClick": "<Double-Button-1>",
            "mouseEnter": "<Enter>",
            "mouseLeave": "<Leave>",
            "hover": "<Motion>",
            "keyPress": "<Key>",
            "focus": "<FocusIn>",
            "blur": "<FocusOut>",
        }
        for event, sequence in sequences.items():
            handler = widget.events.get(event)
            if handler:
                self.body.line(
                    f"self.{var}.bind({py_string(sequence)}, self.{snake(handler, 'on_event')})"
                )

    def _emit(self, widget: Widget, parent: str, ctor: str, extra: list[str] | None = None) -> str:
        var = self.var(widget)
        args = [parent, *(extra or [])]
        joined = ", ".join(a for a in args if a)
        line = f"self.{var} = {ctor}({joined})"
        if len(line) > 96:  # wrap long constructor calls the way black would
            self.body.line(f"self.{var} = {ctor}(")
            for arg in args:
                if arg:
                    self.body.line(f"    {arg},")
            self.body.line(")")
        else:
            self.body.line(line)
        if widget.tooltip:
            self.body.line(f"# Tooltip: {widget.tooltip}")
        self._bindings(widget, var)
        self._place(widget, var)
        return var

    def _ttk(self, ctor: str) -> str:
        self.needs_ttk = True
        return ctor

    def _var(self, widget: Widget, kind: str, initial: str) -> str:
        """Declare a Tk control variable (`StringVar`, `IntVar`, ...)."""
        name = f"{self.var(widget)}_var"
        self.variables.append((name, kind, initial))
        return name

    # -- containers ---------------------------------------------------------

    def _container(self, widget: Widget, parent: str, ctor: str,
                   extra: list[str] | None = None) -> None:
        var = self._emit(widget, parent, ctor, extra)
        if widget.children:
            self.deferred.append((widget, var))
            self.body.line(f"self._build_{var}()")
            self.body.blank()

    def emit_frame(self, widget: Widget, parent: str) -> None:
        relief = widget.props.get("relief", "flat")
        extra = self._style_args(widget, text_color=False)
        if relief != "flat":
            extra += [f"relief={py_string(relief)}", "bd=1"]
        self._container(widget, parent, "tk.Frame", extra)

    def emit_panel(self, widget: Widget, parent: str) -> None:
        self._container(widget, parent, "tk.Frame", self._style_args(widget, text_color=False))

    def emit_group(self, widget: Widget, parent: str) -> None:
        self._container(widget, parent, self._ttk("ttk.LabelFrame"),
                        [f"text={py_string(widget.text)}"])

    def emit_tabs(self, widget: Widget, parent: str) -> None:
        var = self._emit(widget, parent, self._ttk("ttk.Notebook"))
        titles = widget.props.get("items") or [c.text or c.name or f"Tab {i + 1}"
                                               for i, c in enumerate(widget.children)]
        for index, child in enumerate(widget.children):
            title = titles[index] if index < len(titles) else f"Tab {index + 1}"
            page = self.var(child)
            self.body.line(f"self.{page} = tk.Frame(self.{var})")
            self.body.line(f"self.{var}.add(self.{page}, text={py_string(title)})")
            if child.children:
                self.deferred.append((child, page))
                self.body.line(f"self._build_{page}()")
        self.body.blank()

    def emit_scroll_area(self, widget: Widget, parent: str) -> None:
        var = self.var(widget)
        self.needs_ttk = True
        self.body.lines(
            f"self.{var} = tk.Frame({parent})",
            f"self.{var}_canvas = tk.Canvas(self.{var}, highlightthickness=0)",
            f"self.{var}_scroll = ttk.Scrollbar(",
            f"    self.{var}, orient='vertical', command=self.{var}_canvas.yview",
            ")",
            f"self.{var}_inner = tk.Frame(self.{var}_canvas)",
            f"self.{var}_canvas.configure(yscrollcommand=self.{var}_scroll.set)",
            f"self.{var}_canvas.create_window((0, 0), window=self.{var}_inner, anchor='nw')",
            f"self.{var}_inner.bind(",
            "    '<Configure>',",
            f"    lambda _event: self.{var}_canvas.configure(",
            f"        scrollregion=self.{var}_canvas.bbox('all')",
            "    ),",
            ")",
            f"self.{var}_scroll.pack(side='right', fill='y')",
            f"self.{var}_canvas.pack(side='left', fill='both', expand=True)",
        )
        self._place(widget, var)
        if widget.children:
            self.deferred.append((widget, f"{var}_inner"))
            self.body.line(f"self._build_{var}_inner()")
            self.body.blank()

    def emit_splitter(self, widget: Widget, parent: str) -> None:
        orientation = widget.props.get("orientation", "horizontal")
        var = self._emit(widget, parent, self._ttk("ttk.PanedWindow"),
                         [f"orient={py_string(orientation)}"])
        for child in widget.children:
            pane = self.var(child)
            self.body.line(f"self.{pane} = tk.Frame(self.{var})")
            self.body.line(f"self.{var}.add(self.{pane}, weight=1)")
            if child.children:
                self.deferred.append((child, pane))
                self.body.line(f"self._build_{pane}()")
        self.body.blank()

    def emit_toolbar(self, widget: Widget, parent: str) -> None:
        self._container(widget, parent, "tk.Frame",
                        [*self._style_args(widget, text_color=False), "relief='raised'", "bd=1"])

    def emit_sidebar(self, widget: Widget, parent: str) -> None:
        self._container(widget, parent, "tk.Frame", self._style_args(widget, text_color=False))

    # -- inputs -------------------------------------------------------------

    def emit_textbox(self, widget: Widget, parent: str) -> None:
        var_name = self._var(widget, "StringVar", py_string(widget.props.get("value", "")))
        extra = [f"textvariable=self.{var_name}", *self._style_args(widget)]
        if widget.props.get("readOnly"):
            extra.append("state='readonly'")
        self._emit(widget, parent, self._ttk("ttk.Entry"), extra)

    def emit_password_box(self, widget: Widget, parent: str) -> None:
        var_name = self._var(widget, "StringVar", '""')
        mask = widget.props.get("maskChar") or "*"
        self._emit(widget, parent, self._ttk("ttk.Entry"),
                   [f"textvariable=self.{var_name}", f"show={py_string(mask[0])}",
                    *self._style_args(widget)])

    def emit_multiline_text(self, widget: Widget, parent: str) -> None:
        wrap = "word" if widget.props.get("wrap", True) else "none"
        var = self._emit(widget, parent, "tk.Text",
                         [f"wrap={py_string(wrap)}", *self._style_args(widget)])
        if value := widget.props.get("value"):
            self.body.line(f"self.{var}.insert('1.0', {py_string(str(value))})")
            self.body.blank()

    def emit_number_input(self, widget: Widget, parent: str) -> None:
        var_name = self._var(widget, "DoubleVar", str(widget.props.get("value", 0)))
        self._emit(widget, parent, self._ttk("ttk.Spinbox"), [
            f"from_={widget.props.get('min', 0)}",
            f"to={widget.props.get('max', 100)}",
            f"increment={widget.props.get('step', 1)}",
            f"textvariable=self.{var_name}",
        ])

    def emit_slider(self, widget: Widget, parent: str) -> None:
        var_name = self._var(widget, "DoubleVar", str(widget.props.get("value", 50)))
        extra = [
            f"from_={widget.props.get('min', 0)}",
            f"to={widget.props.get('max', 100)}",
            f"orient={py_string(widget.props.get('orientation', 'horizontal'))}",
            f"variable=self.{var_name}",
        ]
        if handler := widget.events.get("change"):
            extra.append(f"command=self.{snake(handler, 'on_event')}")
        self._emit(widget, parent, self._ttk("ttk.Scale"), extra)

    def emit_checkbox(self, widget: Widget, parent: str) -> None:
        var_name = self._var(widget, "BooleanVar", str(bool(widget.props.get("checked"))))
        extra = [f"text={py_string(widget.text)}", f"variable=self.{var_name}"]
        if command := self._command(widget, "change") or self._command(widget, "click"):
            extra.append(command)
        self._emit(widget, parent, self._ttk("ttk.Checkbutton"), extra)

    def emit_radio_button(self, widget: Widget, parent: str) -> None:
        group = snake(widget.props.get("group", "group1"))
        var_name = f"{group}_var"
        if var_name not in {v[0] for v in self.variables}:
            self.variables.append((var_name, "StringVar",
                                   py_string(str(widget.props.get("value", "")))))
        extra = [f"text={py_string(widget.text)}", f"variable=self.{var_name}",
                 f"value={py_string(str(widget.props.get('value', widget.text)))}"]
        if command := self._command(widget, "change"):
            extra.append(command)
        self._emit(widget, parent, self._ttk("ttk.Radiobutton"), extra)

    def emit_combo_box(self, widget: Widget, parent: str) -> None:
        items = [str(i) for i in widget.props.get("items", [])]
        var_name = self._var(widget, "StringVar",
                             py_string(items[0]) if items else '""')
        extra = [f"textvariable=self.{var_name}",
                 f"values={_py_list(items)}"]
        if not widget.props.get("editable"):
            extra.append("state='readonly'")
        var = self._emit(widget, parent, self._ttk("ttk.Combobox"), extra)
        if handler := widget.events.get("change"):
            self.body.line(
                f"self.{var}.bind('<<ComboboxSelected>>', self.{snake(handler, 'on_event')})"
            )
            self.body.blank()

    def emit_color_picker(self, widget: Widget, parent: str) -> None:
        self.gen.needs_colorchooser = True
        var = self.var(widget)
        color = to_hex(widget.props.get("value"), "#3b82f6")
        self.body.lines(
            f"self.{var}_color = {py_string(color)}",
            f"self.{var} = tk.Button(",
            f"    {parent},",
            f"    text={py_string(widget.text or 'Choose Color...')},",
            f"    bg=self.{var}_color,",
            f"    command=lambda: self._pick_color({py_string(var)}),",
            ")",
        )
        self._place(widget, var)

    def emit_date_picker(self, widget: Widget, parent: str) -> None:
        # Tkinter ships no date widget; an Entry with a format hint is the
        # honest stdlib-only answer.
        self.gen.warn(
            "Tkinter has no built-in date picker; generated an Entry. "
            "Install `tkcalendar` for a real calendar widget.", widget.id)
        var_name = self._var(widget, "StringVar", py_string(str(widget.props.get("value", ""))))
        self._emit(widget, parent, self._ttk("ttk.Entry"), [f"textvariable=self.{var_name}"])

    # -- buttons ------------------------------------------------------------

    def emit_button(self, widget: Widget, parent: str) -> None:
        extra = [f"text={py_string(widget.text)}"]
        if command := self._command(widget):
            extra.append(command)
        # ttk.Button ignores bg/fg, so fall back to tk.Button when styled.
        styled = widget.appearance.background or widget.appearance.color
        ctor = "tk.Button" if styled else self._ttk("ttk.Button")
        if styled:
            extra += self._style_args(widget) + ["relief='flat'", "cursor='hand2'"]
        self._emit(widget, parent, ctor, extra)

    def emit_toggle_button(self, widget: Widget, parent: str) -> None:
        var_name = self._var(widget, "BooleanVar", str(bool(widget.props.get("checked"))))
        extra = [f"text={py_string(widget.text)}", f"variable=self.{var_name}"]
        if command := self._command(widget, "change") or self._command(widget, "click"):
            extra.append(command)
        self._emit(widget, parent, self._ttk("ttk.Checkbutton"), [*extra, "style='Toolbutton'"])

    def emit_icon_button(self, widget: Widget, parent: str) -> None:
        icon = widget.props.get("icon", "")
        extra = [f"text={py_string(widget.text or icon or '*')}"]
        if command := self._command(widget):
            extra.append(command)
        if widget.props.get("flat", True):
            extra.append("relief='flat'")
        self._emit(widget, parent, "tk.Button", [*extra, *self._style_args(widget)])

    # -- display ------------------------------------------------------------

    def emit_label(self, widget: Widget, parent: str) -> None:
        anchor = {"left": "w", "center": "center", "right": "e"}.get(
            widget.props.get("align", "left"), "w")
        self._emit(widget, parent, "tk.Label", [
            f"text={py_string(widget.text)}",
            f"anchor={py_string(anchor)}",
            *self._style_args(widget),
        ])

    def emit_image(self, widget: Widget, parent: str) -> None:
        source = widget.props.get("source", "")
        if not source:
            self.gen.warn("Image widget has no source; emitted an empty Label.", widget.id)
            self._emit(widget, parent, "tk.Label", ["text='[image]'"])
            return
        self.gen.needs_photoimage = True
        var = self.var(widget)
        self.body.lines(
            f"self.{var}_image = tk.PhotoImage(file={py_string(source)})",
            f"self.{var} = tk.Label({parent}, image=self.{var}_image)",
        )
        self._place(widget, var)

    def emit_progress_bar(self, widget: Widget, parent: str) -> None:
        indeterminate = widget.props.get("indeterminate")
        extra = [
            f"orient={py_string(widget.props.get('orientation', 'horizontal'))}",
            f"maximum={widget.props.get('max', 100)}",
            f"mode={py_string('indeterminate' if indeterminate else 'determinate')}",
        ]
        var = self._emit(widget, parent, self._ttk("ttk.Progressbar"), extra)
        if indeterminate:
            self.body.line(f"self.{var}.start(12)")
        else:
            self.body.line(f"self.{var}['value'] = {widget.props.get('value', 0)}")
        self.body.blank()

    def emit_spinner(self, widget: Widget, parent: str) -> None:
        var = self._emit(widget, parent, self._ttk("ttk.Progressbar"),
                         ["mode='indeterminate'"])
        if widget.props.get("running", True):
            self.body.line(f"self.{var}.start(10)")
            self.body.blank()

    def emit_separator(self, widget: Widget, parent: str) -> None:
        self._emit(widget, parent, self._ttk("ttk.Separator"),
                   [f"orient={py_string(widget.props.get('orientation', 'horizontal'))}"])

    def emit_table(self, widget: Widget, parent: str) -> None:
        columns = [str(c) for c in widget.props.get("columns", ["Column 1"])]
        keys = [snake(c, f"col{i}") for i, c in enumerate(columns)]
        var = self._emit(widget, parent, self._ttk("ttk.Treeview"),
                         [f"columns={_py_list(keys)}", "show='headings'"])
        for key, title in zip(keys, columns):
            self.body.line(f"self.{var}.heading({py_string(key)}, text={py_string(title)})")
        self.body.blank()

    def emit_tree_view(self, widget: Widget, parent: str) -> None:
        var = self._emit(widget, parent, self._ttk("ttk.Treeview"),
                         [] if widget.props.get("showRoot", True) else ["show='tree'"])
        items = [str(i) for i in widget.props.get("items", [])]
        if items:
            self.body.comment("Sample nodes; replace with your own data source.")
            stack: list[tuple[int, str]] = []
            for index, raw in enumerate(items):
                depth = (len(raw) - len(raw.lstrip())) // 2
                while stack and stack[-1][0] >= depth:
                    stack.pop()
                parent_node = f"self.{var}_node{stack[-1][1]}" if stack else "''"
                node = f"{var}_node{index}"
                self.body.line(
                    f"self.{node} = self.{var}.insert("
                    f"{parent_node}, 'end', text={py_string(raw.strip())})"
                )
                stack.append((depth, str(index)))
            self.body.blank()

    # -- navigation ---------------------------------------------------------

    def emit_menu_bar(self, widget: Widget, parent: str) -> None:
        var = self.var(widget)
        self.body.line(f"self.{var} = tk.Menu(self)")
        for item in widget.props.get("items", []):
            menu = f"{var}_{snake(str(item), 'menu')}"
            self.body.lines(
                f"self.{menu} = tk.Menu(self.{var}, tearoff=0)",
                f"self.{var}.add_cascade(label={py_string(str(item))}, menu=self.{menu})",
            )
        self.body.line(f"self.configure(menu=self.{var})")
        self.body.blank()

    def emit_status_bar(self, widget: Widget, parent: str) -> None:
        self._emit(widget, parent, "tk.Label", [
            f"text={py_string(widget.text or 'Ready')}",
            "anchor='w'", "relief='sunken'", "bd=1",
            *self._style_args(widget),
        ])

    # -- advanced -----------------------------------------------------------

    def emit_canvas(self, widget: Widget, parent: str) -> None:
        background = to_hex(widget.props.get("background"), "#ffffff")
        self._container(widget, parent, "tk.Canvas",
                        [f"bg={py_string(background)}", "highlightthickness=0"])

    def emit_markdown_viewer(self, widget: Widget, parent: str) -> None:
        self.gen.warn("Tkinter has no Markdown renderer; emitted a read-only Text widget.",
                      widget.id)
        var = self._emit(widget, parent, "tk.Text", ["wrap='word'", *self._style_args(widget)])
        content = str(widget.props.get("content", ""))
        if content:
            self.body.line(f"self.{var}.insert('1.0', {py_string(content)})")
        self.body.line(f"self.{var}.configure(state='disabled')")
        self.body.blank()

    def emit_open_gl_view(self, widget: Widget, parent: str) -> None:
        self.gen.warn("Tkinter cannot host an OpenGL context without `pyopengltk`; "
                      "emitted a placeholder Canvas.", widget.id)
        self._emit(widget, parent, "tk.Canvas", ["bg='#101014'", "highlightthickness=0"])

    def emit_web_view(self, widget: Widget, parent: str) -> None:
        self.gen.warn("Tkinter has no web view; emitted a placeholder Frame. "
                      "Consider `tkinterweb` or `pywebview`.", widget.id)
        self._emit(widget, parent, "tk.Label",
                   [f"text={py_string(str(widget.props.get('url', '')))}",
                    "relief='sunken'", "bd=1"])

    # -- fallback -----------------------------------------------------------

    def emit_fallback(self, widget: Widget, parent: str) -> None:
        self.gen.unsupported(widget.type, widget.id)
        var = self.var(widget)
        self.body.comment(f"TODO: '{widget.type}' is not supported by the Tkinter generator.")
        self.body.line(
            f"self.{var} = tk.Label({parent}, text={py_string(widget.text or widget.type)}, "
            "relief='groove', bd=1)"
        )
        self._place(widget, var)


def _py_list(values: list[str]) -> str:
    return "(" + ", ".join(py_string(v) for v in values) + (",)" if len(values) == 1 else ")")


@registry.register
class TkinterGenerator(CodeGenerator):
    info = GeneratorInfo(
        id="tkinter",
        label="Tkinter",
        language="python",
        language_label="Python",
        extension=".py",
        monaco_language="python",
        description="Python standard library GUI toolkit. No dependencies required.",
        features=["stdlib-only", "ttk widgets", "class-based"],
    )

    def __init__(self) -> None:
        super().__init__()
        self.needs_colorchooser = False
        self.needs_photoimage = False

    def generate(self, project: Project) -> list[GeneratedFile]:
        visitor = _TkVisitor(self)
        window = next((w for w in project.widgets if w.type == "window"), None)
        roots = window.children if window else project.widgets

        # Pass 1: build the root body, collecting deferred container methods.
        for widget in roots:
            visitor.visit(widget, "self")

        # Pass 2: drain deferred containers (each may defer more of its own).
        container_methods: list[tuple[str, str]] = []
        while visitor.deferred:
            container, var = visitor.deferred.pop(0)
            nested = CodeWriter()
            outer, visitor.body = visitor.body, nested
            for child in container.children:
                if container.type in ("tabs", "splitter"):
                    continue  # pages were emitted inline by the parent
                visitor.visit(child, f"self.{var}")
            if container.type in ("tabs", "splitter"):
                for child in container.children:
                    visitor.visit(child, f"self.{var}")
            visitor.body = outer
            container_methods.append((var, nested.render()))

        return [GeneratedFile(
            path="main.py",
            content=self._assemble(project, window, visitor, container_methods),
            language="python",
        )]

    # -- assembly -----------------------------------------------------------

    def _assemble(self, project: Project, window, visitor: _TkVisitor,
                  container_methods: list[tuple[str, str]]) -> str:
        spec = project.window
        title = window.text if window and window.text else spec.title
        class_name = _class_name(project.project.name)
        writer = CodeWriter()

        writer.docstring(
            f"{project.project.name}\n\n"
            f"{project.project.description or 'Generated by GUIForge.'}\n\n"
            "This file was generated from a GUIForge project. Edit the callback\n"
            "methods at the bottom; the UI construction section is regenerated on export."
        )
        writer.blank()
        writer.line("import tkinter as tk")
        if visitor.needs_ttk:
            writer.line("from tkinter import ttk")
        if self.needs_colorchooser:
            writer.line("from tkinter import colorchooser")
        writer.blank(2)

        with writer.block(f"class {class_name}(tk.Tk):"):
            writer.docstring(f"Main application window for {project.project.name}.")
            writer.blank()

            with writer.block("def __init__(self) -> None:"):
                writer.line("super().__init__()")
                writer.line(f"self.title({py_string(title)})")
                writer.line(f"self.geometry({py_string(f'{spec.width}x{spec.height}')})")
                if not spec.resizable:
                    writer.line("self.resizable(False, False)")
                if spec.min_width and spec.min_height:
                    writer.line(f"self.minsize({spec.min_width}, {spec.min_height})")
                if bg := to_hex(spec.background):
                    writer.line(f"self.configure(bg={py_string(bg)})")
                if visitor.variables:
                    writer.blank()
                    writer.comment("Control variables bound to the input widgets.")
                    for name, kind, initial in visitor.variables:
                        writer.line(f"self.{name} = tk.{kind}(value={initial})")
                writer.blank()
                writer.line("self._build_ui()")
                if handler := _window_event(project, "windowOpen"):
                    writer.line(f"self.after(0, self.{handler})")
                if handler := _window_event(project, "windowClose"):
                    writer.line(f'self.protocol("WM_DELETE_WINDOW", self.{handler})')
            writer.blank()

            writer.banner("UI construction")
            writer.blank()
            with writer.block("def _build_ui(self) -> None:"):
                writer.docstring("Create and place the top-level widgets.")
                body = visitor.body.render().rstrip()
                writer.line(body if body else "pass")

            for var, source in container_methods:
                writer.blank()
                with writer.block(f"def _build_{var}(self) -> None:"):
                    writer.docstring(f"Populate the '{var}' container.")
                    content = source.rstrip()
                    writer.line(content if content else "pass")

            if self.needs_colorchooser:
                writer.blank()
                with writer.block("def _pick_color(self, target: str) -> None:"):
                    writer.docstring("Open the system color chooser and apply the result.")
                    writer.line('_, hex_color = colorchooser.askcolor(parent=self)')
                    with writer.block("if hex_color:"):
                        writer.line('setattr(self, f"{target}_color", hex_color)')
                        writer.line('getattr(self, target).configure(bg=hex_color)')

            handlers = collect_event_handlers(project)
            writer.blank()
            writer.banner("Event handlers")
            if not handlers:
                writer.blank()
                writer.comment("No events are wired up yet. Assign handler names in "
                               "the GUIForge Events panel.")
            for name, owner, event in handlers:
                writer.blank()
                signature = "self, event=None" if _needs_event_arg(event) else "self"
                with writer.block(f"def {name}({signature}) -> None:"):
                    writer.docstring(f"Handle the '{event}' event of {owner}.")
                    writer.line("raise NotImplementedError(f\"TODO: implement "
                                f"{name}()\")")

        writer.blank(2)
        with writer.block('if __name__ == "__main__":'):
            writer.line(f"app = {class_name}()")
            writer.line("app.mainloop()")

        return writer.render()


def _needs_event_arg(event: str) -> bool:
    return event in {"doubleClick", "hover", "keyPress", "mouseEnter", "mouseLeave",
                     "focus", "blur", "change"}


def _window_event(project: Project, event: str) -> str | None:
    for widget in project.iter_widgets():
        if widget.type == "window" and (handler := widget.events.get(event)):
            return snake(handler, "on_event")
    return None


def _class_name(project_name: str) -> str:
    from generators.shared import pascal
    name = pascal(project_name, "MainWindow")
    return name if name.endswith(("Window", "App")) else f"{name}App"
