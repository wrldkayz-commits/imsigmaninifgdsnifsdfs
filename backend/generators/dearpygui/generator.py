"""Dear PyGui code generator.

Dear PyGui is immediate-mode with a retained-mode Python API: containers are
context managers, and widgets are created by `add_*` calls. That structure maps
naturally onto nested `with` blocks, so unlike the Tkinter/Qt generators this
one does *not* split containers into separate methods — inlining them is what
idiomatic Dear PyGui code looks like.

Callbacks are emitted as module-level functions above the UI, because Dear PyGui
requires them to exist before they are referenced.
"""

from __future__ import annotations

from generators.base import CodeGenerator, GeneratedFile, GeneratorInfo, registry
from generators.shared import CodeWriter, WidgetVisitor, py_string, snake, to_rgba_ints
from generators.shared.visitor import collect_event_handlers
from models.schema import Project, Widget


class _DpgVisitor(WidgetVisitor):
    supported = {
        "frame", "group", "panel", "tabs", "scrollArea", "splitter",
        "textbox", "passwordBox", "multilineText", "numberInput", "slider",
        "checkbox", "radioButton", "comboBox", "colorPicker", "datePicker",
        "button", "toggleButton", "iconButton",
        "label", "image", "progressBar", "spinner", "separator", "table", "treeView",
        "menuBar", "toolbar", "statusBar", "sidebar", "canvas",
    }

    def __init__(self, generator: "DearPyGuiGenerator") -> None:
        super().__init__()
        self.gen = generator
        self.body = CodeWriter()
        self.themes: list[tuple[str, Widget]] = []

    # -- helpers ------------------------------------------------------------

    def _common(self, widget: Widget, *, sized: bool = True) -> list[str]:
        """Arguments every `add_*` call accepts."""
        tag = self.var(widget)
        args = [f'tag="{tag}"']
        pos = widget.layout.position
        args.append(f"pos=[{int(pos.x)}, {int(pos.y)}]")
        if sized:
            size = widget.layout.size
            args.append(f"width={int(size.width)}")
            args.append(f"height={int(size.height)}")
        if not widget.behavior.visible:
            args.append("show=False")
        if not widget.behavior.enabled:
            args.append("enabled=False")
        return args

    def _callback(self, widget: Widget, event: str = "click") -> str | None:
        handler = widget.events.get(event)
        return f"callback={snake(handler, 'on_event')}" if handler else None

    def _add(self, widget: Widget, call: str, *args: str, sized: bool = True) -> str:
        tag = self.var(widget)
        arguments = [a for a in args if a] + self._common(widget, sized=sized)
        self._write_call(f"dpg.{call}", arguments)
        if widget.tooltip:
            with self.body.block(f'with dpg.tooltip("{tag}"):'):
                self.body.line(f"dpg.add_text({py_string(widget.tooltip)})")
        if self._has_theme(widget):
            self.themes.append((tag, widget))
            self.body.line(f'dpg.bind_item_theme("{tag}", _theme_{tag})')
        for handler_event in ("hover", "mouseEnter", "mouseLeave", "doubleClick"):
            if widget.events.get(handler_event):
                self.gen.warn(
                    f"Dear PyGui handles '{handler_event}' through item handler "
                    "registries; a stub was generated but not bound.", widget.id)
        return tag

    def _write_call(self, func: str, arguments: list[str]) -> None:
        single = f"{func}({', '.join(arguments)})"
        if len(single) <= 92:
            self.body.line(single)
        else:
            self.body.line(f"{func}(")
            for argument in arguments:
                self.body.line(f"    {argument},")
            self.body.line(")")

    def _has_theme(self, widget: Widget) -> bool:
        appearance = widget.appearance
        return bool(appearance.background or appearance.color or appearance.radius)

    def _container(self, widget: Widget, header: str, *args: str) -> None:
        tag = self.var(widget)
        arguments = [a for a in args if a] + self._common(widget)
        joined = ", ".join(arguments)
        with self.body.block(f"with dpg.{header}({joined}):"):
            if widget.children:
                self.visit_children(widget, tag)
            else:
                self.body.line("pass")
        self.body.blank()

    # -- containers ---------------------------------------------------------

    def emit_frame(self, widget: Widget, parent: str) -> None:
        self._container(widget, "child_window", "border=True")

    def emit_panel(self, widget: Widget, parent: str) -> None:
        self._container(widget, "child_window", "border=False")

    def emit_scroll_area(self, widget: Widget, parent: str) -> None:
        horizontal = bool(widget.props.get("horizontalScroll", False))
        self._container(widget, "child_window", f"horizontal_scrollbar={horizontal}")

    def emit_group(self, widget: Widget, parent: str) -> None:
        tag = self.var(widget)
        arguments = ["border=True", *self._common(widget)]
        with self.body.block(f"with dpg.child_window({', '.join(arguments)}):"):
            if widget.text:
                self.body.line(f"dpg.add_text({py_string(widget.text)})")
                self.body.line("dpg.add_separator()")
            if widget.children:
                self.visit_children(widget, tag)
            elif not widget.text:
                self.body.line("pass")
        self.body.blank()

    def emit_tabs(self, widget: Widget, parent: str) -> None:
        tag = self.var(widget)
        with self.body.block(f"with dpg.tab_bar({', '.join(self._common(widget, sized=False))}):"):
            titles = widget.props.get("items") or [c.text or f"Tab {i + 1}"
                                                   for i, c in enumerate(widget.children)]
            if not widget.children:
                for index, title in enumerate(titles):
                    with self.body.block(
                            f"with dpg.tab(label={py_string(str(title))}, "
                            f'tag="{tag}_tab{index}"):'):
                        self.body.line("pass")
            for index, child in enumerate(widget.children):
                title = str(titles[index]) if index < len(titles) else f"Tab {index + 1}"
                page = self.var(child)
                with self.body.block(
                        f'with dpg.tab(label={py_string(title)}, tag="{page}"):'):
                    if child.children:
                        self.visit_children(child, page)
                    else:
                        self.body.line("pass")
        self.body.blank()

    def emit_splitter(self, widget: Widget, parent: str) -> None:
        self.gen.warn("Dear PyGui has no splitter; emitted side-by-side child windows.",
                      widget.id)
        horizontal = widget.props.get("orientation", "horizontal") == "horizontal"
        tag = self.var(widget)
        with self.body.block(f"with dpg.group(horizontal={horizontal}, "
                             f'tag="{tag}", pos=[{int(widget.layout.position.x)}, '
                             f"{int(widget.layout.position.y)}]):"):
            if widget.children:
                for child in widget.children:
                    self.visit(child, tag)
            else:
                self.body.line("pass")
        self.body.blank()

    def emit_toolbar(self, widget: Widget, parent: str) -> None:
        horizontal = widget.props.get("orientation", "horizontal") == "horizontal"
        tag = self.var(widget)
        with self.body.block(f'with dpg.group(horizontal={horizontal}, tag="{tag}", '
                             f"pos=[{int(widget.layout.position.x)}, "
                             f"{int(widget.layout.position.y)}]):"):
            if widget.children:
                self.visit_children(widget, tag)
            else:
                self.body.line("pass")
        self.body.blank()

    def emit_sidebar(self, widget: Widget, parent: str) -> None:
        tag = self.var(widget)
        with self.body.block(f"with dpg.child_window({', '.join(self._common(widget))}):"):
            items = [str(i) for i in widget.props.get("items", [])]
            emitted = False
            for index, item in enumerate(items):
                self.body.line(f"dpg.add_button(label={py_string(item)}, "
                               f'width=-1, tag="{tag}_item{index}")')
                emitted = True
            if widget.children:
                self.visit_children(widget, tag)
                emitted = True
            if not emitted:
                self.body.line("pass")
        self.body.blank()

    def emit_canvas(self, widget: Widget, parent: str) -> None:
        tag = self.var(widget)
        with self.body.block(f"with dpg.drawlist({', '.join(self._common(widget))}):"):
            self.body.comment("Draw into this list, e.g. "
                              "dpg.draw_circle((60, 60), 40, color=(255, 255, 255))")
            self.body.line("pass")
        self.body.blank()

    # -- inputs -------------------------------------------------------------

    def emit_textbox(self, widget: Widget, parent: str) -> None:
        args = [f"default_value={py_string(str(widget.props.get('value', '')))}"]
        if hint := widget.props.get("placeholder"):
            args.append(f"hint={py_string(str(hint))}")
        if widget.props.get("readOnly"):
            args.append("readonly=True")
        if callback := self._callback(widget, "change"):
            args.append(callback)
        self._add(widget, "add_input_text", *args)

    def emit_password_box(self, widget: Widget, parent: str) -> None:
        args = ["password=True"]
        if hint := widget.props.get("placeholder"):
            args.append(f"hint={py_string(str(hint))}")
        if callback := self._callback(widget, "change"):
            args.append(callback)
        self._add(widget, "add_input_text", *args)

    def emit_multiline_text(self, widget: Widget, parent: str) -> None:
        args = ["multiline=True",
                f"default_value={py_string(str(widget.props.get('value', '')))}"]
        if callback := self._callback(widget, "change"):
            args.append(callback)
        self._add(widget, "add_input_text", *args)

    def emit_number_input(self, widget: Widget, parent: str) -> None:
        args = [
            f"default_value={widget.props.get('value', 0)}",
            f"min_value={widget.props.get('min', 0)}",
            f"max_value={widget.props.get('max', 100)}",
            f"step={widget.props.get('step', 1)}",
            "min_clamped=True", "max_clamped=True",
        ]
        if callback := self._callback(widget, "change"):
            args.append(callback)
        self._add(widget, "add_input_int", *args)

    def emit_slider(self, widget: Widget, parent: str) -> None:
        vertical = widget.props.get("orientation") == "vertical"
        args = [
            f"default_value={widget.props.get('value', 50)}",
            f"min_value={widget.props.get('min', 0)}",
            f"max_value={widget.props.get('max', 100)}",
        ]
        if vertical:
            args.append("vertical=True")
        if callback := self._callback(widget, "change"):
            args.append(callback)
        self._add(widget, "add_slider_int", *args)

    def emit_checkbox(self, widget: Widget, parent: str) -> None:
        args = [f"label={py_string(widget.text)}",
                f"default_value={bool(widget.props.get('checked'))}"]
        if callback := self._callback(widget, "change") or self._callback(widget, "click"):
            args.append(callback)
        self._add(widget, "add_checkbox", *args, sized=False)

    def emit_radio_button(self, widget: Widget, parent: str) -> None:
        # Dear PyGui models a radio group as one widget, so sibling radios with
        # the same group name are folded into a single `add_radio_button`.
        group = snake(widget.props.get("group", "group1"))
        if group in self.gen.emitted_radio_groups:
            return
        self.gen.emitted_radio_groups.add(group)
        siblings = self.gen.radio_groups.get(group, [widget])
        labels = [s.text or str(s.props.get("value", "")) for s in siblings]
        default = next((s.text for s in siblings if s.props.get("checked")), labels[0])
        args = [f"items=[{', '.join(py_string(str(v)) for v in labels)}]",
                f"default_value={py_string(str(default))}"]
        if callback := self._callback(widget, "change"):
            args.append(callback)
        self._add(widget, "add_radio_button", *args, sized=False)

    def emit_combo_box(self, widget: Widget, parent: str) -> None:
        items = [str(i) for i in widget.props.get("items", [])]
        index = int(widget.props.get("selected", 0) or 0)
        args = [f"items=[{', '.join(py_string(i) for i in items)}]"]
        if items and 0 <= index < len(items):
            args.append(f"default_value={py_string(items[index])}")
        if callback := self._callback(widget, "change"):
            args.append(callback)
        self._add(widget, "add_combo", *args, sized=False)

    def emit_color_picker(self, widget: Widget, parent: str) -> None:
        rgba = to_rgba_ints(widget.props.get("value"), (59, 130, 246, 255))
        args = [f"default_value={list(rgba)}"]
        if callback := self._callback(widget, "change"):
            args.append(callback)
        self._add(widget, "add_color_edit", *args, sized=False)

    def emit_date_picker(self, widget: Widget, parent: str) -> None:
        self._add(widget, "add_date_picker", "level=dpg.mvDatePickerLevel_Day", sized=False)

    # -- buttons ------------------------------------------------------------

    def emit_button(self, widget: Widget, parent: str) -> None:
        args = [f"label={py_string(widget.text)}"]
        if callback := self._callback(widget):
            args.append(callback)
        self._add(widget, "add_button", *args)

    def emit_toggle_button(self, widget: Widget, parent: str) -> None:
        args = [f"label={py_string(widget.text)}",
                f"default_value={bool(widget.props.get('checked'))}"]
        if callback := self._callback(widget, "change") or self._callback(widget, "click"):
            args.append(callback)
        self._add(widget, "add_checkbox", *args, sized=False)

    def emit_icon_button(self, widget: Widget, parent: str) -> None:
        label = widget.text or str(widget.props.get("icon", "")) or "*"
        args = [f"label={py_string(label)}"]
        if callback := self._callback(widget):
            args.append(callback)
        self._add(widget, "add_button", *args)

    # -- display ------------------------------------------------------------

    def emit_label(self, widget: Widget, parent: str) -> None:
        self._add(widget, "add_text", py_string(widget.text), sized=False)

    def emit_image(self, widget: Widget, parent: str) -> None:
        source = str(widget.props.get("source", ""))
        if not source:
            self.gen.warn("Image widget has no source; emitted a text placeholder.", widget.id)
            self._add(widget, "add_text", py_string("[image]"), sized=False)
            return
        self.gen.textures.append((self.var(widget), source))
        self._add(widget, "add_image", f'"{self.var(widget)}_texture"')

    def emit_progress_bar(self, widget: Widget, parent: str) -> None:
        lo = float(widget.props.get("min", 0))
        hi = float(widget.props.get("max", 100))
        value = float(widget.props.get("value", 0))
        fraction = round((value - lo) / (hi - lo), 3) if hi > lo else 0.0
        self._add(widget, "add_progress_bar", f"default_value={fraction}")

    def emit_spinner(self, widget: Widget, parent: str) -> None:
        self._add(widget, "add_loading_indicator", sized=False)

    def emit_separator(self, widget: Widget, parent: str) -> None:
        tag = self.var(widget)
        pos = widget.layout.position
        self.body.line(f'dpg.add_separator(tag="{tag}", '
                       f"pos=[{int(pos.x)}, {int(pos.y)}])")

    def emit_table(self, widget: Widget, parent: str) -> None:
        columns = [str(c) for c in widget.props.get("columns", ["Column 1"])]
        rows = int(widget.props.get("rows", 0) or 0)
        tag = self.var(widget)
        arguments = ["header_row=True", "borders_innerH=True", "borders_outerH=True",
                     "borders_innerV=True", "borders_outerV=True", *self._common(widget)]
        with self.body.block(f"with dpg.table({', '.join(arguments)}):"):
            for column in columns:
                self.body.line(f"dpg.add_table_column(label={py_string(column)})")
            if rows:
                self.body.blank()
                self.body.comment("Placeholder rows; replace with your data.")
                with self.body.block(f"for row in range({rows}):"):
                    with self.body.block("with dpg.table_row():"):
                        with self.body.block(f"for column in range({len(columns)}):"):
                            self.body.line('dpg.add_text(f"r{row}c{column}")')
        self.body.blank()

    def emit_tree_view(self, widget: Widget, parent: str) -> None:
        tag = self.var(widget)
        items = [str(i) for i in widget.props.get("items", [])]
        with self.body.block(f"with dpg.child_window({', '.join(self._common(widget))}):"):
            if not items:
                self.body.line("pass")
            else:
                self._emit_tree_nodes(items, tag)
        self.body.blank()

    def _emit_tree_nodes(self, items: list[str], tag: str) -> None:
        """Render an indentation-encoded outline as nested `dpg.tree_node`s."""
        index = 0

        def render(depth: int) -> None:
            nonlocal index
            while index < len(items):
                raw = items[index]
                item_depth = (len(raw) - len(raw.lstrip())) // 2
                if item_depth < depth:
                    return
                label = raw.strip()
                has_children = (
                    index + 1 < len(items)
                    and (len(items[index + 1]) - len(items[index + 1].lstrip())) // 2 > item_depth
                )
                index += 1
                if has_children:
                    with self.body.block(
                            f"with dpg.tree_node(label={py_string(label)}, "
                            f"default_open=True):"):
                        render(item_depth + 1)
                else:
                    self.body.line(f"dpg.add_text({py_string(label)}, bullet=True)")

        render(0)

    # -- navigation ---------------------------------------------------------

    def emit_menu_bar(self, widget: Widget, parent: str) -> None:
        with self.body.block("with dpg.menu_bar():"):
            items = [str(i) for i in widget.props.get("items", [])] or ["File"]
            for item in items:
                with self.body.block(f"with dpg.menu(label={py_string(item)}):"):
                    self.body.line(f"dpg.add_menu_item(label=\"(empty)\", enabled=False)")
        self.body.blank()

    def emit_status_bar(self, widget: Widget, parent: str) -> None:
        self._add(widget, "add_text", py_string(widget.text or "Ready"), sized=False)

    # -- fallback -----------------------------------------------------------

    def emit_fallback(self, widget: Widget, parent: str) -> None:
        self.gen.unsupported(widget.type, widget.id)
        self.body.comment(f"TODO: '{widget.type}' has no Dear PyGui equivalent.")
        self._add(widget, "add_text",
                  py_string(f"[{widget.type}] {widget.text}".strip()), sized=False)


@registry.register
class DearPyGuiGenerator(CodeGenerator):
    info = GeneratorInfo(
        id="dearpygui",
        label="Dear PyGui",
        language="python",
        language_label="Python",
        extension=".py",
        monaco_language="python",
        description="GPU-accelerated immediate-mode GUI. Requires `dearpygui`.",
        features=["GPU rendered", "themes", "tables & plots"],
    )

    def __init__(self) -> None:
        super().__init__()
        self.textures: list[tuple[str, str]] = []
        self.radio_groups: dict[str, list[Widget]] = {}
        self.emitted_radio_groups: set[str] = set()

    def generate(self, project: Project) -> list[GeneratedFile]:
        self._index_radio_groups(project)
        visitor = _DpgVisitor(self)
        window = next((w for w in project.widgets if w.type == "window"), None)
        roots = window.children if window else project.widgets

        for widget in roots:
            visitor.visit(widget, "primary_window")

        return [
            GeneratedFile("main.py", self._assemble(project, window, visitor), "python"),
            GeneratedFile("requirements.txt", "dearpygui>=1.11.0\n", "text"),
        ]

    def _index_radio_groups(self, project: Project) -> None:
        for widget in project.iter_widgets():
            if widget.type == "radioButton":
                group = snake(widget.props.get("group", "group1"))
                self.radio_groups.setdefault(group, []).append(widget)

    def _assemble(self, project: Project, window, visitor: _DpgVisitor) -> str:
        spec = project.window
        title = window.text if window and window.text else spec.title
        writer = CodeWriter()

        writer.docstring(
            f"{project.project.name}\n\n"
            f"{project.project.description or 'Generated by GUIForge.'}\n\n"
            "Requires Dear PyGui:  pip install dearpygui"
        )
        writer.blank()
        writer.line("import dearpygui.dearpygui as dpg")
        writer.blank(2)

        writer.banner("Callbacks")
        handlers = collect_event_handlers(project)
        if not handlers:
            writer.blank()
            writer.comment("No events are wired up yet.")
        for name, owner, event in handlers:
            writer.blank()
            with writer.block(f"def {name}(sender, app_data, user_data) -> None:"):
                writer.docstring(f"Handle the '{event}' event of {owner}.")
                writer.line(f'raise NotImplementedError("TODO: implement {name}()")')
        writer.blank(2)

        writer.banner("User interface")
        writer.blank()
        with writer.block("def build_ui() -> None:"):
            writer.docstring("Create the widget tree inside the primary window.")
            if visitor.themes:
                writer.comment("Per-widget themes carry the colors set in the designer.")
                for tag, widget in visitor.themes:
                    self._write_theme(writer, tag, widget)
                writer.blank()
            with writer.block(
                    f'with dpg.window(tag="primary_window", label={py_string(title)}, '
                    "no_title_bar=True):"):
                body = visitor.body.render().rstrip()
                writer.line(body if body else "pass")

        writer.blank(2)
        with writer.block("def main() -> None:"):
            writer.docstring("Boot Dear PyGui and run the render loop.")
            writer.line("dpg.create_context()")
            if self.textures:
                writer.blank()
                writer.comment("Load image assets into the global texture registry.")
                with writer.block("with dpg.texture_registry():"):
                    for tag, source in self.textures:
                        writer.line(f"width, height, _channels, data = "
                                    f"dpg.load_image({py_string(source)})")
                        writer.line(f"dpg.add_static_texture(width, height, data, "
                                    f'tag="{tag}_texture")')
            writer.blank()
            writer.line("build_ui()")
            writer.blank()
            writer.line(f"dpg.create_viewport(")
            writer.line(f"    title={py_string(title)},")
            writer.line(f"    width={spec.width},")
            writer.line(f"    height={spec.height},")
            writer.line(f"    resizable={spec.resizable},")
            writer.line(")")
            writer.line("dpg.setup_dearpygui()")
            writer.line("dpg.show_viewport()")
            writer.line('dpg.set_primary_window("primary_window", True)')
            writer.line("dpg.start_dearpygui()")
            writer.line("dpg.destroy_context()")

        writer.blank(2)
        with writer.block('if __name__ == "__main__":'):
            writer.line("main()")
        return writer.render()

    def _write_theme(self, writer: CodeWriter, tag: str, widget: Widget) -> None:
        with writer.block(f"with dpg.theme() as _theme_{tag}:"):
            with writer.block("with dpg.theme_component(dpg.mvAll):"):
                appearance = widget.appearance
                wrote = False
                if bg := to_rgba_ints(appearance.background):
                    writer.line(f"dpg.add_theme_color(dpg.mvThemeCol_Button, {list(bg)})")
                    writer.line(f"dpg.add_theme_color(dpg.mvThemeCol_ChildBg, {list(bg)})")
                    wrote = True
                if color := to_rgba_ints(appearance.color):
                    writer.line(f"dpg.add_theme_color(dpg.mvThemeCol_Text, {list(color)})")
                    wrote = True
                if appearance.radius:
                    writer.line("dpg.add_theme_style(dpg.mvStyleVar_FrameRounding, "
                                f"{int(appearance.radius)})")
                    wrote = True
                if not wrote:
                    writer.line("pass")
