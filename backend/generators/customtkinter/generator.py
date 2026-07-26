"""CustomTkinter code generator.

CustomTkinter is a themed re-skin of Tkinter, so this generator deliberately
*subclasses* the Tkinter visitor and overrides only what differs: the widget
constructors, the styling keywords (`fg_color` / `text_color` / `corner_radius`
instead of `bg` / `fg` / `bd`), and the appearance-mode bootstrap. Placement,
event binding, container deferral and naming are inherited unchanged.

That inheritance is the point of the architecture: a new framework in the same
family costs a few hundred lines, not a rewrite.
"""

from __future__ import annotations

from generators.base import CodeGenerator, GeneratedFile, GeneratorInfo, registry
from generators.shared import CodeWriter, py_string, snake, to_hex
from generators.shared.visitor import collect_event_handlers
from generators.tkinter.generator import _TkVisitor, _class_name, _needs_event_arg, _py_list
from models.schema import Project, Widget


class _CTkVisitor(_TkVisitor):
    supported = _TkVisitor.supported

    # -- styling ------------------------------------------------------------

    def _style_args(self, widget: Widget, *, text_color: bool = True) -> list[str]:
        args: list[str] = []
        appearance = widget.appearance
        if bg := to_hex(appearance.background):
            args.append(f"fg_color={py_string(bg)}")
        if text_color and (fg := to_hex(appearance.color)):
            args.append(f"text_color={py_string(fg)}")
        if border := to_hex(appearance.border_color):
            args.append(f"border_color={py_string(border)}")
        if appearance.border_width:
            args.append(f"border_width={int(appearance.border_width)}")
        if appearance.radius:
            args.append(f"corner_radius={int(appearance.radius)}")
        if font := self._font(widget):
            args.append(f"font=ctk.CTkFont{font}")
        return args

    def _ttk(self, ctor: str) -> str:  # CustomTkinter needs no ttk fallback
        return ctor

    # -- containers ---------------------------------------------------------

    def emit_frame(self, widget: Widget, parent: str) -> None:
        self._container(widget, parent, "ctk.CTkFrame", self._style_args(widget, text_color=False))

    emit_panel = emit_frame
    emit_sidebar = emit_frame

    def emit_group(self, widget: Widget, parent: str) -> None:
        # CustomTkinter has no group box; a frame plus a heading label reads
        # better than falling back to a raw ttk.LabelFrame inside a CTk app.
        var = self._emit(widget, parent, "ctk.CTkFrame",
                         self._style_args(widget, text_color=False))
        if widget.text:
            self.body.lines(
                f"self.{var}_title = ctk.CTkLabel(",
                f"    self.{var}, text={py_string(widget.text)}, anchor='w'",
                ")",
                f"self.{var}_title.place(x=12, y=8)",
            )
            self.body.blank()
        if widget.children:
            self.deferred.append((widget, var))
            self.body.line(f"self._build_{var}()")
            self.body.blank()

    def emit_tabs(self, widget: Widget, parent: str) -> None:
        var = self._emit(widget, parent, "ctk.CTkTabview")
        titles = widget.props.get("items") or [c.text or f"Tab {i + 1}"
                                               for i, c in enumerate(widget.children)]
        for index, child in enumerate(widget.children):
            title = str(titles[index]) if index < len(titles) else f"Tab {index + 1}"
            page = self.var(child)
            self.body.line(f"self.{page} = self.{var}.add({py_string(title)})")
            if child.children:
                self.deferred.append((child, page))
                self.body.line(f"self._build_{page}()")
        self.body.blank()

    def emit_scroll_area(self, widget: Widget, parent: str) -> None:
        # CustomTkinter ships a real scrollable frame, so the manual
        # canvas+scrollbar dance the Tkinter generator needs disappears here.
        self._container(widget, parent, "ctk.CTkScrollableFrame",
                        self._style_args(widget, text_color=False))

    def emit_toolbar(self, widget: Widget, parent: str) -> None:
        self._container(widget, parent, "ctk.CTkFrame",
                        [*self._style_args(widget, text_color=False), "corner_radius=0"])

    # -- inputs -------------------------------------------------------------

    def emit_textbox(self, widget: Widget, parent: str) -> None:
        extra = [*self._style_args(widget)]
        if placeholder := widget.props.get("placeholder"):
            extra.append(f"placeholder_text={py_string(str(placeholder))}")
        var = self._emit(widget, parent, "ctk.CTkEntry", extra)
        if value := widget.props.get("value"):
            self.body.line(f"self.{var}.insert(0, {py_string(str(value))})")
        if widget.props.get("readOnly"):
            self.body.line(f"self.{var}.configure(state='readonly')")
        self.body.blank()

    def emit_password_box(self, widget: Widget, parent: str) -> None:
        mask = (widget.props.get("maskChar") or "*")[0]
        extra = [f"show={py_string(mask)}", *self._style_args(widget)]
        if placeholder := widget.props.get("placeholder"):
            extra.append(f"placeholder_text={py_string(str(placeholder))}")
        self._emit(widget, parent, "ctk.CTkEntry", extra)

    def emit_multiline_text(self, widget: Widget, parent: str) -> None:
        wrap = "word" if widget.props.get("wrap", True) else "none"
        var = self._emit(widget, parent, "ctk.CTkTextbox",
                         [f"wrap={py_string(wrap)}", *self._style_args(widget)])
        if value := widget.props.get("value"):
            self.body.line(f"self.{var}.insert('1.0', {py_string(str(value))})")
            self.body.blank()

    def emit_number_input(self, widget: Widget, parent: str) -> None:
        self.gen.warn("CustomTkinter has no spinbox; generated a CTkEntry. "
                      "Validate numeric input in your handler.", widget.id)
        self._emit(widget, parent, "ctk.CTkEntry",
                   [f"placeholder_text={py_string(str(widget.props.get('value', 0)))}",
                    *self._style_args(widget)])

    def emit_slider(self, widget: Widget, parent: str) -> None:
        var_name = self._var(widget, "DoubleVar", str(widget.props.get("value", 50)))
        extra = [
            f"from_={widget.props.get('min', 0)}",
            f"to={widget.props.get('max', 100)}",
            f"orientation={py_string(widget.props.get('orientation', 'horizontal'))}",
            f"variable=self.{var_name}",
            *self._style_args(widget, text_color=False),
        ]
        if handler := widget.events.get("change"):
            extra.append(f"command=self.{snake(handler, 'on_event')}")
        self._emit(widget, parent, "ctk.CTkSlider", extra)

    def emit_checkbox(self, widget: Widget, parent: str) -> None:
        var_name = self._var(widget, "BooleanVar", str(bool(widget.props.get("checked"))))
        extra = [f"text={py_string(widget.text)}", f"variable=self.{var_name}",
                 *self._style_args(widget)]
        if command := self._command(widget, "change") or self._command(widget, "click"):
            extra.append(command)
        self._emit(widget, parent, "ctk.CTkCheckBox", extra)

    def emit_radio_button(self, widget: Widget, parent: str) -> None:
        group = snake(widget.props.get("group", "group1"))
        var_name = f"{group}_var"
        if var_name not in {v[0] for v in self.variables}:
            self.variables.append(
                (var_name, "StringVar", py_string(str(widget.props.get("value", "")))))
        extra = [f"text={py_string(widget.text)}", f"variable=self.{var_name}",
                 f"value={py_string(str(widget.props.get('value', widget.text)))}",
                 *self._style_args(widget)]
        if command := self._command(widget, "change"):
            extra.append(command)
        self._emit(widget, parent, "ctk.CTkRadioButton", extra)

    def emit_combo_box(self, widget: Widget, parent: str) -> None:
        items = [str(i) for i in widget.props.get("items", [])]
        ctor = "ctk.CTkComboBox" if widget.props.get("editable") else "ctk.CTkOptionMenu"
        extra = [f"values={_py_list(items) if items else '[]'}",
                 *self._style_args(widget, text_color=False)]
        if handler := widget.events.get("change"):
            extra.append(f"command=self.{snake(handler, 'on_event')}")
        var = self._emit(widget, parent, ctor, extra)
        index = int(widget.props.get("selected", 0) or 0)
        if items and 0 <= index < len(items):
            self.body.line(f"self.{var}.set({py_string(items[index])})")
            self.body.blank()

    def emit_date_picker(self, widget: Widget, parent: str) -> None:
        self.gen.warn("CustomTkinter has no date picker; generated a CTkEntry.", widget.id)
        self._emit(widget, parent, "ctk.CTkEntry", [
            f"placeholder_text={py_string(str(widget.props.get('format', 'yyyy-MM-dd')))}",
            *self._style_args(widget),
        ])

    # -- buttons ------------------------------------------------------------

    def emit_button(self, widget: Widget, parent: str) -> None:
        extra = [f"text={py_string(widget.text)}", *self._style_args(widget)]
        variant = widget.props.get("variant", "primary")
        if variant in ("outline", "ghost") and not widget.appearance.background:
            extra.append("fg_color='transparent'")
            extra.append("border_width=1" if variant == "outline" else "hover=True")
        if command := self._command(widget):
            extra.append(command)
        self._emit(widget, parent, "ctk.CTkButton", extra)

    def emit_toggle_button(self, widget: Widget, parent: str) -> None:
        var_name = self._var(widget, "BooleanVar", str(bool(widget.props.get("checked"))))
        extra = [f"text={py_string(widget.text)}", f"variable=self.{var_name}",
                 *self._style_args(widget, text_color=False)]
        if command := self._command(widget, "change") or self._command(widget, "click"):
            extra.append(command)
        self._emit(widget, parent, "ctk.CTkSwitch", extra)

    def emit_icon_button(self, widget: Widget, parent: str) -> None:
        extra = [f"text={py_string(widget.text or widget.props.get('icon', '') or '*')}",
                 *self._style_args(widget)]
        if widget.props.get("flat", True):
            extra.append("fg_color='transparent'")
        if command := self._command(widget):
            extra.append(command)
        self._emit(widget, parent, "ctk.CTkButton", extra)

    # -- display ------------------------------------------------------------

    def emit_label(self, widget: Widget, parent: str) -> None:
        anchor = {"left": "w", "center": "center", "right": "e"}.get(
            widget.props.get("align", "left"), "w")
        self._emit(widget, parent, "ctk.CTkLabel", [
            f"text={py_string(widget.text)}",
            f"anchor={py_string(anchor)}",
            *self._style_args(widget),
        ])

    def emit_progress_bar(self, widget: Widget, parent: str) -> None:
        extra = [f"orientation={py_string(widget.props.get('orientation', 'horizontal'))}",
                 *self._style_args(widget, text_color=False)]
        var = self._emit(widget, parent, "ctk.CTkProgressBar", extra)
        if widget.props.get("indeterminate"):
            self.body.line(f"self.{var}.configure(mode='indeterminate')")
            self.body.line(f"self.{var}.start()")
        else:
            lo = float(widget.props.get("min", 0))
            hi = float(widget.props.get("max", 100))
            value = float(widget.props.get("value", 0))
            fraction = (value - lo) / (hi - lo) if hi > lo else 0.0
            self.body.line(f"self.{var}.set({round(fraction, 3)})")
        self.body.blank()

    def emit_spinner(self, widget: Widget, parent: str) -> None:
        var = self._emit(widget, parent, "ctk.CTkProgressBar", ["mode='indeterminate'"])
        if widget.props.get("running", True):
            self.body.line(f"self.{var}.start()")
            self.body.blank()

    def emit_separator(self, widget: Widget, parent: str) -> None:
        self._emit(widget, parent, "ctk.CTkFrame",
                   ["height=2", "corner_radius=0",
                    *self._style_args(widget, text_color=False)])

    def emit_canvas(self, widget: Widget, parent: str) -> None:
        self.gen.warn("CustomTkinter has no canvas; falling back to tk.Canvas.", widget.id)
        self.gen.needs_tk = True
        self._container(widget, parent, "tk.Canvas", [
            f"bg={py_string(to_hex(widget.props.get('background'), '#ffffff'))}",
            "highlightthickness=0",
        ])

    def emit_table(self, widget: Widget, parent: str) -> None:
        self.gen.warn("CustomTkinter has no table; falling back to ttk.Treeview.", widget.id)
        self.gen.needs_ttk_fallback = True
        columns = [str(c) for c in widget.props.get("columns", ["Column 1"])]
        keys = [snake(c, f"col{i}") for i, c in enumerate(columns)]
        var = self._emit(widget, parent, "ttk.Treeview",
                         [f"columns={_py_list(keys)}", "show='headings'"])
        for key, title in zip(keys, columns):
            self.body.line(f"self.{var}.heading({py_string(key)}, text={py_string(title)})")
        self.body.blank()

    def emit_tree_view(self, widget: Widget, parent: str) -> None:
        self.gen.warn("CustomTkinter has no tree view; falling back to ttk.Treeview.", widget.id)
        self.gen.needs_ttk_fallback = True
        super().emit_tree_view(widget, parent)

    def emit_menu_bar(self, widget: Widget, parent: str) -> None:
        self.gen.needs_tk = True
        super().emit_menu_bar(widget, parent)

    def emit_status_bar(self, widget: Widget, parent: str) -> None:
        self._emit(widget, parent, "ctk.CTkLabel", [
            f"text={py_string(widget.text or 'Ready')}", "anchor='w'",
            *self._style_args(widget),
        ])

    def emit_color_picker(self, widget: Widget, parent: str) -> None:
        self.gen.needs_colorchooser = True
        var = self.var(widget)
        color = to_hex(widget.props.get("value"), "#3b82f6")
        self.body.lines(
            f"self.{var}_color = {py_string(color)}",
            f"self.{var} = ctk.CTkButton(",
            f"    {parent},",
            f"    text={py_string(widget.text or 'Choose Color...')},",
            f"    fg_color=self.{var}_color,",
            f"    command=lambda: self._pick_color({py_string(var)}),",
            ")",
        )
        self._place(widget, var)

    def emit_fallback(self, widget: Widget, parent: str) -> None:
        self.gen.unsupported(widget.type, widget.id)
        var = self.var(widget)
        self.body.comment(f"TODO: '{widget.type}' is not supported by the "
                          "CustomTkinter generator.")
        self.body.line(
            f"self.{var} = ctk.CTkLabel({parent}, "
            f"text={py_string(widget.text or widget.type)})"
        )
        self._place(widget, var)


@registry.register
class CustomTkinterGenerator(CodeGenerator):
    info = GeneratorInfo(
        id="customtkinter",
        label="CustomTkinter",
        language="python",
        language_label="Python",
        extension=".py",
        monaco_language="python",
        description="Modern themed widgets on top of Tkinter. Requires `customtkinter`.",
        features=["dark mode", "rounded widgets", "HiDPI"],
    )

    def __init__(self) -> None:
        super().__init__()
        self.needs_colorchooser = False
        self.needs_tk = False
        self.needs_ttk_fallback = False
        self.needs_photoimage = False

    def generate(self, project: Project) -> list[GeneratedFile]:
        visitor = _CTkVisitor(self)
        window = next((w for w in project.widgets if w.type == "window"), None)
        for widget in (window.children if window else project.widgets):
            visitor.visit(widget, "self")

        container_methods: list[tuple[str, str]] = []
        while visitor.deferred:
            container, var = visitor.deferred.pop(0)
            nested = CodeWriter()
            outer, visitor.body = visitor.body, nested
            if container.type not in ("tabs", "splitter"):
                for child in container.children:
                    visitor.visit(child, f"self.{var}")
            else:
                for child in container.children:
                    visitor.visit(child, f"self.{var}")
            visitor.body = outer
            container_methods.append((var, nested.render()))

        return [
            GeneratedFile("main.py",
                          self._assemble(project, window, visitor, container_methods),
                          "python"),
            GeneratedFile("requirements.txt", "customtkinter>=5.2.0\n", "text"),
        ]

    def _assemble(self, project: Project, window, visitor: _CTkVisitor,
                  container_methods: list[tuple[str, str]]) -> str:
        spec = project.window
        title = window.text if window and window.text else spec.title
        class_name = _class_name(project.project.name)
        writer = CodeWriter()

        writer.docstring(
            f"{project.project.name}\n\n"
            f"{project.project.description or 'Generated by GUIForge.'}\n\n"
            "Requires CustomTkinter:  pip install customtkinter"
        )
        writer.blank()
        writer.line("import customtkinter as ctk")
        if visitor.needs_ttk or self.needs_tk or self.needs_ttk_fallback:
            writer.line("import tkinter as tk")
        if self.needs_ttk_fallback:
            writer.line("from tkinter import ttk")
        if self.needs_colorchooser:
            writer.line("from tkinter import colorchooser")
        writer.blank(2)

        writer.comment("Appearance is applied before any widget is created so the "
                       "whole tree picks it up.")
        writer.line(f"ctk.set_appearance_mode({py_string(project.theme.mode)})")
        writer.line('ctk.set_default_color_theme("blue")')
        writer.blank(2)

        with writer.block(f"class {class_name}(ctk.CTk):"):
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
                if visitor.variables:
                    writer.blank()
                    writer.comment("Control variables bound to the input widgets.")
                    for name, kind, initial in visitor.variables:
                        writer.line(f"self.{name} = ctk.{kind}(value={initial})")
                writer.blank()
                writer.line("self._build_ui()")
                if handler := _window_handler(project, "windowClose"):
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
                    writer.line("_, hex_color = colorchooser.askcolor(parent=self)")
                    with writer.block("if hex_color:"):
                        writer.line('setattr(self, f"{target}_color", hex_color)')
                        writer.line("getattr(self, target).configure(fg_color=hex_color)")

            writer.blank()
            writer.banner("Event handlers")
            handlers = collect_event_handlers(project)
            if not handlers:
                writer.blank()
                writer.comment("No events are wired up yet.")
            for name, owner, event in handlers:
                writer.blank()
                signature = "self, event=None" if _needs_event_arg(event) else "self"
                with writer.block(f"def {name}({signature}) -> None:"):
                    writer.docstring(f"Handle the '{event}' event of {owner}.")
                    writer.line(f'raise NotImplementedError("TODO: implement {name}()")')

        writer.blank(2)
        with writer.block('if __name__ == "__main__":'):
            writer.line(f"app = {class_name}()")
            writer.line("app.mainloop()")
        return writer.render()


def _window_handler(project: Project, event: str) -> str | None:
    for widget in project.iter_widgets():
        if widget.type == "window" and (handler := widget.events.get(event)):
            return snake(handler, "on_event")
    return None
