"""C++ Dear ImGui code generator.

This generator exists to prove the architecture is not Python-shaped. It shares
the same traversal machinery as the Python backends but emits modern C++,
targeting the house style requested in the design brief:

    if (ImGui::Begin("Settings"))
    {
        ImGui::Text("Application");

        static bool enabled = true;
        ImGui::Checkbox("Enable Feature", &enabled);

        if (ImGui::Button("Save"))
        {
            SaveSettings();
        }
    }
    ImGui::End();

Because ImGui is truly immediate-mode, widget state cannot live in the widget —
it lives in a `UiState` struct emitted alongside the draw code. That keeps the
output free of `static` locals scattered through the function, which is what
distinguishes maintainable ImGui code from demo code.

Emitted output:
  * `ui.h`   - `UiState` struct, `DrawUI()` declaration, callback declarations
  * `ui.cpp` - the draw implementation
"""

from __future__ import annotations

from generators.base import CodeGenerator, GeneratedFile, GeneratorInfo, registry
from generators.shared import CodeWriter, WidgetVisitor, cpp_string, pascal, to_float_tuple
from generators.shared.naming import camel, snake
from generators.shared.visitor import collect_event_handlers
from models.schema import Project, Widget


class _StateField:
    """One member of the generated `UiState` struct."""

    __slots__ = ("name", "type", "initial", "comment")

    def __init__(self, name: str, type_: str, initial: str, comment: str = "") -> None:
        self.name = name
        self.type = type_
        self.initial = initial
        self.comment = comment

    def declaration(self) -> str:
        line = f"{self.type} {self.name} = {self.initial};"
        return f"{line:<52} // {self.comment}" if self.comment else line


class _ImGuiVisitor(WidgetVisitor):
    supported = {
        "frame", "group", "panel", "tabs", "scrollArea", "splitter",
        "textbox", "passwordBox", "multilineText", "numberInput", "slider",
        "checkbox", "radioButton", "comboBox", "colorPicker",
        "button", "toggleButton", "iconButton",
        "label", "progressBar", "spinner", "separator", "table", "treeView",
        "menuBar", "toolbar", "statusBar", "sidebar",
    }

    def __init__(self, generator: "ImGuiCppGenerator") -> None:
        super().__init__()
        self.gen = generator
        self.body = CodeWriter()
        self.state: list[_StateField] = []
        self.radio_groups: dict[str, list[Widget]] = {}

    # -- helpers ------------------------------------------------------------

    def field(self, widget: Widget, type_: str, initial: str, suffix: str = "") -> str:
        name = camel(f"{self.var(widget)}{suffix}", "value")
        self.state.append(_StateField(name, type_, initial,
                                      widget.name or widget.text or widget.type))
        return name

    def label(self, widget: Widget) -> str:
        """ImGui identifies widgets by label; `##id` keeps duplicates distinct."""
        text = widget.text or widget.name or ""
        return cpp_string(f"{text}##{self.var(widget)}")

    def _position(self, widget: Widget) -> None:
        pos = widget.layout.position
        self.body.line(f"ImGui::SetCursorPos(ImVec2({pos.x:.1f}f, {pos.y:.1f}f));")

    def _size_arg(self, widget: Widget) -> str:
        size = widget.layout.size
        return f"ImVec2({size.width:.1f}f, {size.height:.1f}f)"

    def _disabled(self, widget: Widget):
        """Wrap emission in ImGui's disabled scope when the widget is disabled."""
        return not widget.behavior.enabled

    def _emit_widget(self, widget: Widget, emit) -> None:
        if not widget.behavior.visible:
            self.body.comment(f"'{widget.name or widget.type}' is hidden in the designer.")
            return
        self._position(widget)
        disabled = self._disabled(widget)
        if disabled:
            self.body.line("ImGui::BeginDisabled();")
        emit()
        if disabled:
            self.body.line("ImGui::EndDisabled();")
        if widget.tooltip:
            with self.body.braces("if (ImGui::IsItemHovered())"):
                self.body.line(f"ImGui::SetTooltip({cpp_string(widget.tooltip)});")
        self._hover_events(widget)
        self.body.blank()

    def _hover_events(self, widget: Widget) -> None:
        if widget.events.get("doubleClick"):
            handler = pascal(widget.events["doubleClick"], "OnDoubleClick")
            with self.body.braces(
                    "if (ImGui::IsItemHovered() && "
                    "ImGui::IsMouseDoubleClicked(ImGuiMouseButton_Left))"):
                self.body.line(f"{handler}();")
        if widget.events.get("mouseEnter"):
            handler = pascal(widget.events["mouseEnter"], "OnMouseEnter")
            with self.body.braces("if (ImGui::IsItemHovered())"):
                self.body.line(f"{handler}();")

    def _action(self, widget: Widget, condition: str, event: str = "click") -> None:
        handler = widget.events.get(event)
        if handler:
            with self.body.braces(f"if ({condition})"):
                self.body.line(f"{pascal(handler, 'OnAction')}();")
        else:
            self.body.line(f"{condition};")

    # -- containers ---------------------------------------------------------

    def emit_frame(self, widget: Widget, parent: str) -> None:
        if not widget.behavior.visible:
            return
        self._position(widget)
        child_id = cpp_string(self.var(widget))
        with self.body.braces(
                f"if (ImGui::BeginChild({child_id}, {self._size_arg(widget)}, "
                "ImGuiChildFlags_Border))"):
            self.visit_children(widget, self.var(widget))
        self.body.line("ImGui::EndChild();")
        self.body.blank()

    emit_panel = emit_frame
    emit_scroll_area = emit_frame
    emit_sidebar = emit_frame

    def emit_group(self, widget: Widget, parent: str) -> None:
        if not widget.behavior.visible:
            return
        self._position(widget)
        child_id = cpp_string(self.var(widget))
        with self.body.braces(
                f"if (ImGui::BeginChild({child_id}, {self._size_arg(widget)}, "
                "ImGuiChildFlags_Border))"):
            if widget.text:
                self.body.line(f"ImGui::SeparatorText({cpp_string(widget.text)});")
                self.body.blank()
            self.visit_children(widget, self.var(widget))
        self.body.line("ImGui::EndChild();")
        self.body.blank()

    def emit_tabs(self, widget: Widget, parent: str) -> None:
        if not widget.behavior.visible:
            return
        self._position(widget)
        titles = widget.props.get("items") or [c.text or f"Tab {i + 1}"
                                               for i, c in enumerate(widget.children)]
        with self.body.braces(f"if (ImGui::BeginTabBar({cpp_string(self.var(widget))}))"):
            pages = widget.children or []
            if pages:
                for index, child in enumerate(pages):
                    title = str(titles[index]) if index < len(titles) else f"Tab {index + 1}"
                    with self.body.braces(f"if (ImGui::BeginTabItem({cpp_string(title)}))"):
                        self.visit_children(child, self.var(child))
                        self.body.line("ImGui::EndTabItem();")
            else:
                for title in titles:
                    with self.body.braces(f"if (ImGui::BeginTabItem({cpp_string(str(title))}))"):
                        self.body.line("ImGui::EndTabItem();")
            self.body.line("ImGui::EndTabBar();")
        self.body.blank()

    def emit_splitter(self, widget: Widget, parent: str) -> None:
        self.gen.warn("Dear ImGui has no splitter primitive; emitted adjacent child "
                      "regions. Use a docking build for true splitters.", widget.id)
        self.emit_frame(widget, parent)

    def emit_toolbar(self, widget: Widget, parent: str) -> None:
        if not widget.behavior.visible:
            return
        self._position(widget)
        with self.body.braces(
                f"if (ImGui::BeginChild({cpp_string(self.var(widget))}, "
                f"{self._size_arg(widget)}, ImGuiChildFlags_None))"):
            children = widget.children
            for index, child in enumerate(children):
                if index:
                    self.body.line("ImGui::SameLine();")
                self.visit(child, self.var(widget))
        self.body.line("ImGui::EndChild();")
        self.body.blank()

    # -- inputs -------------------------------------------------------------

    def emit_textbox(self, widget: Widget, parent: str) -> None:
        field = self.field(widget, "std::string", cpp_string(str(widget.props.get("value", ""))))
        self.gen.needs_string = True
        flags = " , ImGuiInputTextFlags_ReadOnly" if widget.props.get("readOnly") else ""

        def emit() -> None:
            self.body.line(f"ImGui::SetNextItemWidth({widget.layout.size.width:.1f}f);")
            hint = widget.props.get("placeholder")
            if hint:
                call = (f"ImGui::InputTextWithHint({self.label(widget)}, "
                        f"{cpp_string(str(hint))}, &state.{field}{flags})")
            else:
                call = f"ImGui::InputText({self.label(widget)}, &state.{field}{flags})"
            self._action(widget, call, "change")

        self._emit_widget(widget, emit)

    def emit_password_box(self, widget: Widget, parent: str) -> None:
        self.gen.needs_string = True
        field = self.field(widget, "std::string", '""')

        def emit() -> None:
            self.body.line(f"ImGui::SetNextItemWidth({widget.layout.size.width:.1f}f);")
            self.body.line(
                f"ImGui::InputText({self.label(widget)}, &state.{field}, "
                "ImGuiInputTextFlags_Password);")

        self._emit_widget(widget, emit)

    def emit_multiline_text(self, widget: Widget, parent: str) -> None:
        self.gen.needs_string = True
        field = self.field(widget, "std::string",
                           cpp_string(str(widget.props.get("value", ""))))

        def emit() -> None:
            self.body.line(
                f"ImGui::InputTextMultiline({self.label(widget)}, &state.{field}, "
                f"{self._size_arg(widget)});")

        self._emit_widget(widget, emit)

    def emit_number_input(self, widget: Widget, parent: str) -> None:
        field = self.field(widget, "int", str(int(widget.props.get("value", 0))))

        def emit() -> None:
            self.body.line(f"ImGui::SetNextItemWidth({widget.layout.size.width:.1f}f);")
            self._action(widget,
                         f"ImGui::InputInt({self.label(widget)}, &state.{field}, "
                         f"{int(widget.props.get('step', 1))})",
                         "change")

        self._emit_widget(widget, emit)

    def emit_slider(self, widget: Widget, parent: str) -> None:
        field = self.field(widget, "int", str(int(widget.props.get("value", 50))))
        lo, hi = int(widget.props.get("min", 0)), int(widget.props.get("max", 100))

        def emit() -> None:
            self.body.line(f"ImGui::SetNextItemWidth({widget.layout.size.width:.1f}f);")
            self._action(widget,
                         f"ImGui::SliderInt({self.label(widget)}, &state.{field}, {lo}, {hi})",
                         "change")

        self._emit_widget(widget, emit)

    def emit_checkbox(self, widget: Widget, parent: str) -> None:
        field = self.field(widget, "bool",
                           "true" if widget.props.get("checked") else "false")

        def emit() -> None:
            condition = f"ImGui::Checkbox({self.label(widget)}, &state.{field})"
            event = "change" if widget.events.get("change") else "click"
            self._action(widget, condition, event)

        self._emit_widget(widget, emit)

    def emit_radio_button(self, widget: Widget, parent: str) -> None:
        group = snake(widget.props.get("group", "group1"))
        siblings = self.gen.radio_groups.get(group, [widget])
        if widget is not siblings[0]:
            return  # the whole group is emitted at the first member's position
        field = camel(f"{group}_selection", "selection")
        if field not in {f.name for f in self.state}:
            default = next((i for i, s in enumerate(siblings) if s.props.get("checked")), 0)
            self.state.append(_StateField(field, "int", str(default), f"'{group}' selection"))

        def emit() -> None:
            for index, sibling in enumerate(siblings):
                label = cpp_string(sibling.text or f"Option {index + 1}")
                condition = f"ImGui::RadioButton({label}, &state.{field}, {index})"
                handler = sibling.events.get("change") or sibling.events.get("click")
                if handler:
                    with self.body.braces(f"if ({condition})"):
                        self.body.line(f"{pascal(handler, 'OnAction')}();")
                else:
                    self.body.line(f"{condition};")

        self._emit_widget(widget, emit)

    def emit_combo_box(self, widget: Widget, parent: str) -> None:
        items = [str(i) for i in widget.props.get("items", [])] or ["Item"]
        field = self.field(widget, "int", str(int(widget.props.get("selected", 0) or 0)))
        array = camel(f"{self.var(widget)}_items", "items")
        self.gen.item_arrays.append((array, items))

        def emit() -> None:
            self.body.line(f"ImGui::SetNextItemWidth({widget.layout.size.width:.1f}f);")
            self._action(widget,
                         f"ImGui::Combo({self.label(widget)}, &state.{field}, "
                         f"{array}, IM_ARRAYSIZE({array}))",
                         "change")

        self._emit_widget(widget, emit)

    def emit_color_picker(self, widget: Widget, parent: str) -> None:
        rgba = to_float_tuple(widget.props.get("value"), (0.23, 0.51, 0.96, 1.0))
        initial = "{ " + ", ".join(f"{c}f" for c in rgba) + " }"
        field = self.field(widget, "float", initial)
        # Fix the declared type to an array now that we know the arity.
        for entry in self.state:
            if entry.name == field:
                entry.type = "float"
                entry.name = f"{field}[4]"

        def emit() -> None:
            self._action(widget,
                         f"ImGui::ColorEdit4({self.label(widget)}, state.{field})",
                         "change")

        self._emit_widget(widget, emit)

    # -- buttons ------------------------------------------------------------

    def emit_button(self, widget: Widget, parent: str) -> None:
        def emit() -> None:
            styled = self._push_style(widget)
            self._action(widget,
                         f"ImGui::Button({self.label(widget)}, {self._size_arg(widget)})")
            self._pop_style(styled)

        self._emit_widget(widget, emit)

    def emit_icon_button(self, widget: Widget, parent: str) -> None:
        self.emit_button(widget, parent)

    def emit_toggle_button(self, widget: Widget, parent: str) -> None:
        field = self.field(widget, "bool",
                           "true" if widget.props.get("checked") else "false")

        def emit() -> None:
            with self.body.braces(f"if (ImGui::Selectable({self.label(widget)}, "
                                  f"state.{field}, 0, {self._size_arg(widget)}))"):
                self.body.line(f"state.{field} = !state.{field};")
                handler = widget.events.get("change") or widget.events.get("click")
                if handler:
                    self.body.line(f"{pascal(handler, 'OnAction')}();")

        self._emit_widget(widget, emit)

    def _push_style(self, widget: Widget) -> int:
        """Push per-widget colors, returning how many pushes to pop."""
        pushes = 0
        if bg := widget.appearance.background:
            r, g, b, a = to_float_tuple(bg)
            self.body.line(f"ImGui::PushStyleColor(ImGuiCol_Button, "
                           f"ImVec4({r}f, {g}f, {b}f, {a}f));")
            pushes += 1
        if color := widget.appearance.color:
            r, g, b, a = to_float_tuple(color)
            self.body.line(f"ImGui::PushStyleColor(ImGuiCol_Text, "
                           f"ImVec4({r}f, {g}f, {b}f, {a}f));")
            pushes += 1
        return pushes

    def _pop_style(self, pushes: int) -> None:
        if pushes:
            self.body.line(f"ImGui::PopStyleColor({pushes});")

    # -- display ------------------------------------------------------------

    def emit_label(self, widget: Widget, parent: str) -> None:
        def emit() -> None:
            if color := widget.appearance.color:
                r, g, b, a = to_float_tuple(color)
                self.body.line(f"ImGui::TextColored(ImVec4({r}f, {g}f, {b}f, {a}f), "
                               f"{cpp_string(widget.text)});")
            else:
                self.body.line(f"ImGui::TextUnformatted({cpp_string(widget.text)});")

        self._emit_widget(widget, emit)

    def emit_progress_bar(self, widget: Widget, parent: str) -> None:
        lo = float(widget.props.get("min", 0))
        hi = float(widget.props.get("max", 100))
        value = float(widget.props.get("value", 0))
        fraction = round((value - lo) / (hi - lo), 3) if hi > lo else 0.0
        field = self.field(widget, "float", f"{fraction}f")

        def emit() -> None:
            self.body.line(f"ImGui::ProgressBar(state.{field}, {self._size_arg(widget)});")

        self._emit_widget(widget, emit)

    def emit_spinner(self, widget: Widget, parent: str) -> None:
        def emit() -> None:
            self.body.comment("Dear ImGui has no spinner; an animated ellipsis reads "
                              "better than a fake one.")
            self.body.line('ImGui::Text("Working%.*s", '
                           '(int)(ImGui::GetTime() * 3) % 4, "...");')

        self._emit_widget(widget, emit)

    def emit_separator(self, widget: Widget, parent: str) -> None:
        def emit() -> None:
            self.body.line("ImGui::Separator();")

        self._emit_widget(widget, emit)

    def emit_table(self, widget: Widget, parent: str) -> None:
        if not widget.behavior.visible:
            return
        columns = [str(c) for c in widget.props.get("columns", ["Column 1"])]
        rows = int(widget.props.get("rows", 0) or 0)
        self._position(widget)
        flags = "ImGuiTableFlags_Borders | ImGuiTableFlags_RowBg | ImGuiTableFlags_Resizable"
        with self.body.braces(
                f"if (ImGui::BeginTable({cpp_string(self.var(widget))}, "
                f"{len(columns)}, {flags}, {self._size_arg(widget)}))"):
            for column in columns:
                self.body.line(f"ImGui::TableSetupColumn({cpp_string(column)});")
            self.body.line("ImGui::TableHeadersRow();")
            if rows:
                self.body.blank()
                self.body.comment("Placeholder rows; bind to your own data source.")
                with self.body.braces(f"for (int row = 0; row < {rows}; ++row)"):
                    self.body.line("ImGui::TableNextRow();")
                    with self.body.braces(
                            f"for (int column = 0; column < {len(columns)}; ++column)"):
                        self.body.line("ImGui::TableSetColumnIndex(column);")
                        self.body.line('ImGui::Text("r%dc%d", row, column);')
            self.body.line("ImGui::EndTable();")
        self.body.blank()

    def emit_tree_view(self, widget: Widget, parent: str) -> None:
        if not widget.behavior.visible:
            return
        self._position(widget)
        items = [str(i) for i in widget.props.get("items", [])]
        with self.body.braces(
                f"if (ImGui::BeginChild({cpp_string(self.var(widget))}, "
                f"{self._size_arg(widget)}, ImGuiChildFlags_Border))"):
            if items:
                self._emit_tree(items)
            else:
                self.body.comment("Populate from your own hierarchy.");
        self.body.line("ImGui::EndChild();")
        self.body.blank()

    def _emit_tree(self, items: list[str]) -> None:
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
                    with self.body.braces(f"if (ImGui::TreeNode({cpp_string(label)}))"):
                        render(item_depth + 1)
                        self.body.line("ImGui::TreePop();")
                else:
                    self.body.line(f"ImGui::BulletText({cpp_string(label)});")

        render(0)

    # -- navigation ---------------------------------------------------------

    def emit_menu_bar(self, widget: Widget, parent: str) -> None:
        self.gen.uses_menu_bar = True
        items = [str(i) for i in widget.props.get("items", [])] or ["File"]
        with self.body.braces("if (ImGui::BeginMenuBar())"):
            for item in items:
                with self.body.braces(f"if (ImGui::BeginMenu({cpp_string(item)}))"):
                    self.body.line('ImGui::MenuItem("(empty)", nullptr, false, false);')
                    self.body.line("ImGui::EndMenu();")
            self.body.line("ImGui::EndMenuBar();")
        self.body.blank()

    def emit_status_bar(self, widget: Widget, parent: str) -> None:
        def emit() -> None:
            self.body.line(f"ImGui::TextUnformatted("
                           f"{cpp_string(widget.text or 'Ready')});")

        self._emit_widget(widget, emit)

    # -- fallback -----------------------------------------------------------

    def emit_fallback(self, widget: Widget, parent: str) -> None:
        self.gen.unsupported(widget.type, widget.id)
        self.body.comment(f"TODO: '{widget.type}' is not implemented in the ImGui generator.")
        self.body.line(f"ImGui::TextDisabled({cpp_string(f'[{widget.type}] {widget.text}')});")
        self.body.blank()


@registry.register
class ImGuiCppGenerator(CodeGenerator):
    info = GeneratorInfo(
        id="imgui_cpp",
        label="Dear ImGui (C++)",
        language="cpp",
        language_label="C++",
        extension=".cpp",
        monaco_language="cpp",
        status="beta",
        description="Modern immediate-mode C++ UI. Emits ui.h + ui.cpp in idiomatic style.",
        features=["immediate mode", "explicit state struct", "tables & tree nodes"],
    )

    def __init__(self) -> None:
        super().__init__()
        self.needs_string = False
        self.uses_menu_bar = False
        self.item_arrays: list[tuple[str, list[str]]] = []
        self.radio_groups: dict[str, list[Widget]] = {}

    def generate(self, project: Project) -> list[GeneratedFile]:
        for widget in project.iter_widgets():
            if widget.type == "radioButton":
                group = snake(widget.props.get("group", "group1"))
                self.radio_groups.setdefault(group, []).append(widget)

        visitor = _ImGuiVisitor(self)
        window = next((w for w in project.widgets if w.type == "window"), None)
        for widget in (window.children if window else project.widgets):
            visitor.visit(widget, "root")

        handlers = [(pascal(name, "OnAction"), owner, event)
                    for name, owner, event in collect_event_handlers(project)]
        return [
            GeneratedFile("ui.h", self._header(project, visitor, handlers), "cpp"),
            GeneratedFile("ui.cpp", self._source(project, window, visitor), "cpp"),
        ]

    # -- files --------------------------------------------------------------

    def _header(self, project: Project, visitor: _ImGuiVisitor,
                handlers: list[tuple[str, str, str]]) -> str:
        writer = CodeWriter()
        writer.comment(f"{project.project.name} - generated by GUIForge.", "//")
        writer.comment("UI state and entry points.", "//")
        writer.line("#pragma once")
        writer.blank()
        if self.needs_string:
            writer.line("#include <string>")
            writer.blank()

        writer.comment("Immediate-mode UI has no widget objects to hold state, so every\n"
                       "mutable value the interface needs lives here and is passed to\n"
                       "DrawUI() each frame.", "//")
        with writer.braces("struct UiState", semicolon=True):
            if visitor.state:
                for entry in visitor.state:
                    writer.line(entry.declaration())
            else:
                writer.comment("No stateful widgets in this design yet.", "//")
        writer.blank()

        writer.line("void DrawUI(UiState& state);")
        if handlers:
            writer.blank()
            writer.comment("Event handlers - implement these in your application.", "//")
            for name, owner, event in handlers:
                writer.line(f"{f'void {name}();':<32} // {event} of {owner}")
        return writer.render()

    def _source(self, project: Project, window, visitor: _ImGuiVisitor) -> str:
        spec = project.window
        title = window.text if window and window.text else spec.title
        writer = CodeWriter()

        writer.comment(f"{project.project.name} - generated by GUIForge.", "//")
        writer.comment("Regenerated on export; keep application logic in your own files.",
                       "//")
        writer.line('#include "ui.h"')
        writer.blank()
        writer.line("#include <imgui.h>")
        if self.needs_string:
            writer.line("#include <misc/cpp/imgui_stdlib.h>   // ImGui::InputText for std::string")
        writer.blank()

        if self.item_arrays:
            writer.comment("Static item lists referenced by combo boxes.", "//")
            with writer.braces("namespace"):
                for array, items in self.item_arrays:
                    joined = ", ".join(cpp_string(i) for i in items)
                    writer.line(f"const char* const {array}[] = {{ {joined} }};")
            writer.blank()

        with writer.braces("void DrawUI(UiState& state)"):
            writer.line(f"ImGui::SetNextWindowSize(ImVec2({spec.width}.0f, "
                        f"{spec.height}.0f), ImGuiCond_FirstUseEver);")
            flags = "ImGuiWindowFlags_MenuBar" if self.uses_menu_bar \
                else "ImGuiWindowFlags_None"
            with writer.braces(f"if (ImGui::Begin({cpp_string(title)}, nullptr, {flags}))"):
                body = visitor.body.render().rstrip()
                writer.line(body if body else "// The design is empty.")
            writer.line("ImGui::End();")
        return writer.render()
