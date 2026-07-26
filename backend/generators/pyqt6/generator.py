"""PyQt6 code generator.

Qt's idioms differ enough from Tkinter that this generator shares the traversal
machinery (`WidgetVisitor`) but nothing else. Notable choices:

* A `QMainWindow` subclass, because menu bars, toolbars and status bars are
  first-class there and map cleanly onto the designer's navigation widgets.
* `setGeometry` for absolute placement, matching the designer's canvas model.
* Signals connected in a dedicated `_connect_signals()` method rather than
  inline, which is what Qt developers actually do and keeps `_build_ui` clean.
* Styling emitted as a single stylesheet block per widget — Qt's supported way
  of doing per-widget appearance.
"""

from __future__ import annotations

from generators.base import CodeGenerator, GeneratedFile, GeneratorInfo, registry
from generators.shared import CodeWriter, WidgetVisitor, pascal, py_string, snake, to_hex
from generators.shared.visitor import collect_event_handlers
from models.schema import Project, Widget

# Designer event -> (Qt signal, whether the slot receives an argument)
_SIGNALS: dict[str, dict[str, tuple[str, bool]]] = {
    "button": {"click": ("clicked", False)},
    "iconButton": {"click": ("clicked", False)},
    "toggleButton": {"click": ("toggled", True), "change": ("toggled", True)},
    "checkbox": {"change": ("stateChanged", True), "click": ("clicked", False)},
    "radioButton": {"change": ("toggled", True), "click": ("clicked", False)},
    "slider": {"change": ("valueChanged", True)},
    "numberInput": {"change": ("valueChanged", True)},
    "comboBox": {"change": ("currentIndexChanged", True)},
    "textbox": {"change": ("textChanged", True)},
    "passwordBox": {"change": ("textChanged", True)},
    "multilineText": {"change": ("textChanged", False)},
    "datePicker": {"change": ("dateChanged", True)},
    "table": {"doubleClick": ("cellDoubleClicked", True)},
    "treeView": {"change": ("itemSelectionChanged", False)},
    "sidebar": {"change": ("currentRowChanged", True)},
}


class _QtVisitor(WidgetVisitor):
    supported = {
        "frame", "group", "panel", "tabs", "scrollArea", "splitter",
        "textbox", "passwordBox", "multilineText", "numberInput", "slider",
        "checkbox", "radioButton", "comboBox", "colorPicker", "datePicker",
        "button", "toggleButton", "iconButton",
        "label", "image", "progressBar", "spinner", "separator", "table", "treeView",
        "menuBar", "toolbar", "statusBar", "sidebar",
        "canvas", "openGLView", "markdownViewer", "webView",
    }

    def __init__(self, generator: "PyQt6Generator") -> None:
        super().__init__()
        self.gen = generator
        self.body = CodeWriter()
        self.deferred: list[tuple[Widget, str]] = []
        self.connections: list[str] = []
        self.imports: set[str] = {"QMainWindow", "QWidget", "QApplication"}
        self.core_imports: set[str] = set()
        self.gui_imports: set[str] = set()

    # -- helpers ------------------------------------------------------------

    def _need(self, *classes: str) -> None:
        self.imports.update(classes)

    def _geometry(self, widget: Widget, var: str) -> None:
        pos, size = widget.layout.position, widget.layout.size
        self.body.line(
            f"self.{var}.setGeometry("
            f"{int(pos.x)}, {int(pos.y)}, {int(size.width)}, {int(size.height)})"
        )

    def _finish(self, widget: Widget, var: str, *, geometry: bool = True) -> None:
        if geometry:
            self._geometry(widget, var)
        if widget.tooltip:
            self.body.line(f"self.{var}.setToolTip({py_string(widget.tooltip)})")
        if not widget.behavior.enabled:
            self.body.line(f"self.{var}.setEnabled(False)")
        if not widget.behavior.visible:
            self.body.line(f"self.{var}.setVisible(False)")
        if widget.behavior.tab_order is not None:
            self.body.line(f"# Tab order: {widget.behavior.tab_order}")
        if not widget.behavior.focusable:
            self.core_imports.add("Qt")
            self.body.line(f"self.{var}.setFocusPolicy(Qt.FocusPolicy.NoFocus)")
        if stylesheet := self._stylesheet(widget):
            self.body.line(f"self.{var}.setStyleSheet({py_string(stylesheet)})")
        if font := self._font(widget):
            self.gui_imports.add("QFont")
            self.body.line(f"self.{var}.setFont({font})")
        self._connect(widget, var)
        self.body.blank()

    def _stylesheet(self, widget: Widget) -> str:
        rules: list[str] = []
        appearance = widget.appearance
        if bg := to_hex(appearance.background):
            rules.append(f"background-color: {bg};")
        if color := to_hex(appearance.color):
            rules.append(f"color: {color};")
        if appearance.border_width:
            border = to_hex(appearance.border_color, "#000000")
            rules.append(f"border: {int(appearance.border_width)}px solid {border};")
        if appearance.radius:
            rules.append(f"border-radius: {int(appearance.radius)}px;")
        return " ".join(rules)

    def _font(self, widget: Widget) -> str | None:
        font = widget.appearance.font
        if font.family == "Segoe UI" and font.size == 12 and font.weight == "normal" \
                and font.style == "normal" and not font.underline:
            return None
        args = [py_string(font.family), str(font.size)]
        if font.weight == "bold":
            args.append("QFont.Weight.Bold")
        call = f"QFont({', '.join(args)})"
        if font.style == "italic" or font.underline:
            return call  # italics/underline set separately below for readability
        return call

    def _connect(self, widget: Widget, var: str) -> None:
        mapping = _SIGNALS.get(widget.type, {})
        for event, handler in sorted(widget.events.items()):
            if not handler:
                continue
            slot = snake(handler, "on_event")
            signal = mapping.get(event)
            if signal:
                self.connections.append(f"self.{var}.{signal[0]}.connect(self.{slot})")
            elif event in ("mouseEnter", "mouseLeave", "hover", "keyPress", "doubleClick"):
                self.gen.warn(
                    f"Qt exposes '{event}' through event filters, not signals. "
                    f"A stub for {slot}() was generated — install it with an "
                    "eventFilter if you need it.", widget.id)

    def _emit(self, widget: Widget, parent: str, ctor: str, *args: str) -> str:
        var = self.var(widget)
        joined = ", ".join([*args, parent])
        self.body.line(f"self.{var} = {ctor}({joined})")
        return var

    def _container(self, widget: Widget, parent: str, ctor: str, *args: str) -> str:
        var = self._emit(widget, parent, ctor, *args)
        self._finish(widget, var)
        if widget.children:
            self.deferred.append((widget, var))
            self.body.line(f"self._build_{var}()")
            self.body.blank()
        return var

    # -- containers ---------------------------------------------------------

    def emit_frame(self, widget: Widget, parent: str) -> None:
        self._need("QFrame")
        var = self._emit(widget, parent, "QFrame")
        relief = widget.props.get("relief", "flat")
        shapes = {"raised": "Box", "sunken": "Panel", "groove": "StyledPanel",
                  "ridge": "WinPanel"}
        if relief in shapes:
            self.body.line(f"self.{var}.setFrameShape(QFrame.Shape.{shapes[relief]})")
        self._finish(widget, var)
        if widget.children:
            self.deferred.append((widget, var))
            self.body.line(f"self._build_{var}()")
            self.body.blank()

    def emit_panel(self, widget: Widget, parent: str) -> None:
        self._need("QWidget")
        self._container(widget, parent, "QWidget")

    def emit_group(self, widget: Widget, parent: str) -> None:
        self._need("QGroupBox")
        self._container(widget, parent, "QGroupBox", py_string(widget.text))

    def emit_tabs(self, widget: Widget, parent: str) -> None:
        self._need("QTabWidget", "QWidget")
        var = self._emit(widget, parent, "QTabWidget")
        position = widget.props.get("tabPosition", "top").capitalize()
        if position != "Top":
            self.body.line(f"self.{var}.setTabPosition(QTabWidget.TabPosition.{position})")
        self._finish(widget, var)
        titles = widget.props.get("items") or [c.text or f"Tab {i + 1}"
                                               for i, c in enumerate(widget.children)]
        for index, child in enumerate(widget.children):
            title = str(titles[index]) if index < len(titles) else f"Tab {index + 1}"
            page = self.var(child)
            self.body.line(f"self.{page} = QWidget()")
            self.body.line(f"self.{var}.addTab(self.{page}, {py_string(title)})")
            if child.children:
                self.deferred.append((child, page))
                self.body.line(f"self._build_{page}()")
        self.body.blank()

    def emit_scroll_area(self, widget: Widget, parent: str) -> None:
        self._need("QScrollArea", "QWidget")
        self.core_imports.add("Qt")
        var = self._emit(widget, parent, "QScrollArea")
        self.body.line(f"self.{var}.setWidgetResizable(True)")
        if not widget.props.get("horizontalScroll", False):
            self.body.line(
                f"self.{var}.setHorizontalScrollBarPolicy("
                "Qt.ScrollBarPolicy.ScrollBarAlwaysOff)"
            )
        self._finish(widget, var)
        inner = f"{var}_content"
        self.body.line(f"self.{inner} = QWidget()")
        self.body.line(f"self.{var}.setWidget(self.{inner})")
        if widget.children:
            self.deferred.append((widget, inner))
            self.body.line(f"self._build_{inner}()")
        self.body.blank()

    def emit_splitter(self, widget: Widget, parent: str) -> None:
        self._need("QSplitter", "QWidget")
        self.core_imports.add("Qt")
        orientation = "Horizontal" if widget.props.get(
            "orientation", "horizontal") == "horizontal" else "Vertical"
        var = self._emit(widget, parent, "QSplitter", f"Qt.Orientation.{orientation}")
        self._finish(widget, var)
        for child in widget.children:
            pane = self.var(child)
            self.body.line(f"self.{pane} = QWidget()")
            self.body.line(f"self.{var}.addWidget(self.{pane})")
            if child.children:
                self.deferred.append((child, pane))
                self.body.line(f"self._build_{pane}()")
        self.body.blank()

    # -- inputs -------------------------------------------------------------

    def emit_textbox(self, widget: Widget, parent: str) -> None:
        self._need("QLineEdit")
        var = self._emit(widget, parent, "QLineEdit")
        if placeholder := widget.props.get("placeholder"):
            self.body.line(f"self.{var}.setPlaceholderText({py_string(str(placeholder))})")
        if value := widget.props.get("value"):
            self.body.line(f"self.{var}.setText({py_string(str(value))})")
        if widget.props.get("readOnly"):
            self.body.line(f"self.{var}.setReadOnly(True)")
        self._finish(widget, var)

    def emit_password_box(self, widget: Widget, parent: str) -> None:
        self._need("QLineEdit")
        var = self._emit(widget, parent, "QLineEdit")
        self.body.line(f"self.{var}.setEchoMode(QLineEdit.EchoMode.Password)")
        if placeholder := widget.props.get("placeholder"):
            self.body.line(f"self.{var}.setPlaceholderText({py_string(str(placeholder))})")
        self._finish(widget, var)

    def emit_multiline_text(self, widget: Widget, parent: str) -> None:
        self._need("QTextEdit")
        var = self._emit(widget, parent, "QTextEdit")
        if placeholder := widget.props.get("placeholder"):
            self.body.line(f"self.{var}.setPlaceholderText({py_string(str(placeholder))})")
        if value := widget.props.get("value"):
            self.body.line(f"self.{var}.setPlainText({py_string(str(value))})")
        if not widget.props.get("wrap", True):
            self._need("QTextEdit")
            self.body.line(f"self.{var}.setLineWrapMode(QTextEdit.LineWrapMode.NoWrap)")
        self._finish(widget, var)

    def emit_number_input(self, widget: Widget, parent: str) -> None:
        self._need("QSpinBox")
        var = self._emit(widget, parent, "QSpinBox")
        self.body.line(f"self.{var}.setRange({int(widget.props.get('min', 0))}, "
                       f"{int(widget.props.get('max', 100))})")
        self.body.line(f"self.{var}.setValue({int(widget.props.get('value', 0))})")
        if (step := widget.props.get("step", 1)) != 1:
            self.body.line(f"self.{var}.setSingleStep({int(step)})")
        self._finish(widget, var)

    def emit_slider(self, widget: Widget, parent: str) -> None:
        self._need("QSlider")
        self.core_imports.add("Qt")
        orientation = "Horizontal" if widget.props.get(
            "orientation", "horizontal") == "horizontal" else "Vertical"
        var = self._emit(widget, parent, "QSlider", f"Qt.Orientation.{orientation}")
        self.body.line(f"self.{var}.setRange({int(widget.props.get('min', 0))}, "
                       f"{int(widget.props.get('max', 100))})")
        self.body.line(f"self.{var}.setValue({int(widget.props.get('value', 50))})")
        self._finish(widget, var)

    def emit_checkbox(self, widget: Widget, parent: str) -> None:
        self._need("QCheckBox")
        var = self._emit(widget, parent, "QCheckBox", py_string(widget.text))
        if widget.props.get("checked"):
            self.body.line(f"self.{var}.setChecked(True)")
        self._finish(widget, var)

    def emit_radio_button(self, widget: Widget, parent: str) -> None:
        self._need("QRadioButton", "QButtonGroup")
        var = self._emit(widget, parent, "QRadioButton", py_string(widget.text))
        if widget.props.get("checked"):
            self.body.line(f"self.{var}.setChecked(True)")
        group = snake(widget.props.get("group", "group1"))
        self.gen.button_groups.setdefault(group, []).append(var)
        self._finish(widget, var)

    def emit_combo_box(self, widget: Widget, parent: str) -> None:
        self._need("QComboBox")
        var = self._emit(widget, parent, "QComboBox")
        items = [str(i) for i in widget.props.get("items", [])]
        if items:
            self.body.line(f"self.{var}.addItems([{', '.join(py_string(i) for i in items)}])")
        index = int(widget.props.get("selected", 0) or 0)
        if 0 < index < len(items):
            self.body.line(f"self.{var}.setCurrentIndex({index})")
        if widget.props.get("editable"):
            self.body.line(f"self.{var}.setEditable(True)")
        self._finish(widget, var)

    def emit_color_picker(self, widget: Widget, parent: str) -> None:
        self._need("QPushButton", "QColorDialog")
        self.gui_imports.add("QColor")
        self.gen.needs_color_dialog = True
        var = self._emit(widget, parent, "QPushButton",
                         py_string(widget.text or "Choose Color..."))
        color = to_hex(widget.props.get("value"), "#3b82f6")
        self.body.line(f"self.{var}_color = QColor({py_string(color)})")
        self.connections.append(
            f"self.{var}.clicked.connect(lambda: self._pick_color({py_string(var)}))")
        self._finish(widget, var)

    def emit_date_picker(self, widget: Widget, parent: str) -> None:
        self._need("QDateEdit")
        self.core_imports.add("QDate")
        var = self._emit(widget, parent, "QDateEdit")
        self.body.line(f"self.{var}.setCalendarPopup(True)")
        self.body.line(f"self.{var}.setDisplayFormat("
                       f"{py_string(str(widget.props.get('format', 'yyyy-MM-dd')))})")
        self.body.line(f"self.{var}.setDate(QDate.currentDate())")
        self._finish(widget, var)

    # -- buttons ------------------------------------------------------------

    def emit_button(self, widget: Widget, parent: str) -> None:
        self._need("QPushButton")
        var = self._emit(widget, parent, "QPushButton", py_string(widget.text))
        if widget.props.get("variant") == "primary" and not widget.appearance.background:
            self.body.line(f"self.{var}.setDefault(True)")
        self._finish(widget, var)

    def emit_toggle_button(self, widget: Widget, parent: str) -> None:
        self._need("QPushButton")
        var = self._emit(widget, parent, "QPushButton", py_string(widget.text))
        self.body.line(f"self.{var}.setCheckable(True)")
        if widget.props.get("checked"):
            self.body.line(f"self.{var}.setChecked(True)")
        self._finish(widget, var)

    def emit_icon_button(self, widget: Widget, parent: str) -> None:
        self._need("QToolButton")
        var = self._emit(widget, parent, "QToolButton")
        self.body.line(f"self.{var}.setText("
                       f"{py_string(widget.text or widget.props.get('icon', '') or '*')})")
        if widget.props.get("flat", True):
            self.body.line(f"self.{var}.setAutoRaise(True)")
        self._finish(widget, var)

    # -- display ------------------------------------------------------------

    def emit_label(self, widget: Widget, parent: str) -> None:
        self._need("QLabel")
        var = self._emit(widget, parent, "QLabel", py_string(widget.text))
        align = widget.props.get("align", "left")
        if align != "left":
            self.core_imports.add("Qt")
            flag = {"center": "AlignCenter", "right": "AlignRight"}[align]
            self.body.line(f"self.{var}.setAlignment(Qt.AlignmentFlag.{flag} "
                           "| Qt.AlignmentFlag.AlignVCenter)")
        self._finish(widget, var)

    def emit_image(self, widget: Widget, parent: str) -> None:
        self._need("QLabel")
        self.gui_imports.add("QPixmap")
        self.core_imports.add("Qt")
        var = self._emit(widget, parent, "QLabel")
        source = str(widget.props.get("source", ""))
        if source:
            self.body.line(f"self.{var}.setPixmap(QPixmap({py_string(source)}))")
            if widget.props.get("fit", "contain") != "none":
                self.body.line(f"self.{var}.setScaledContents(True)")
        else:
            self.gen.warn("Image widget has no source.", widget.id)
            self.body.line(f"self.{var}.setText('[image]')")
        self.body.line(f"self.{var}.setAlignment(Qt.AlignmentFlag.AlignCenter)")
        self._finish(widget, var)

    def emit_progress_bar(self, widget: Widget, parent: str) -> None:
        self._need("QProgressBar")
        var = self._emit(widget, parent, "QProgressBar")
        if widget.props.get("indeterminate"):
            self.body.line(f"self.{var}.setRange(0, 0)  # indeterminate")
        else:
            self.body.line(f"self.{var}.setRange({int(widget.props.get('min', 0))}, "
                           f"{int(widget.props.get('max', 100))})")
            self.body.line(f"self.{var}.setValue({int(widget.props.get('value', 0))})")
        self._finish(widget, var)

    def emit_spinner(self, widget: Widget, parent: str) -> None:
        self._need("QProgressBar")
        var = self._emit(widget, parent, "QProgressBar")
        self.body.line(f"self.{var}.setRange(0, 0)  # busy indicator")
        self.body.line(f"self.{var}.setTextVisible(False)")
        self._finish(widget, var)

    def emit_separator(self, widget: Widget, parent: str) -> None:
        self._need("QFrame")
        var = self._emit(widget, parent, "QFrame")
        shape = "HLine" if widget.props.get("orientation", "horizontal") == "horizontal" \
            else "VLine"
        self.body.line(f"self.{var}.setFrameShape(QFrame.Shape.{shape})")
        self.body.line(f"self.{var}.setFrameShadow(QFrame.Shadow.Sunken)")
        self._finish(widget, var)

    def emit_table(self, widget: Widget, parent: str) -> None:
        self._need("QTableWidget", "QAbstractItemView")
        columns = [str(c) for c in widget.props.get("columns", ["Column 1"])]
        rows = int(widget.props.get("rows", 0) or 0)
        var = self._emit(widget, parent, "QTableWidget", str(rows), str(len(columns)))
        self.body.line(f"self.{var}.setHorizontalHeaderLabels("
                       f"[{', '.join(py_string(c) for c in columns)}])")
        if not widget.props.get("selectable", True):
            self.body.line(f"self.{var}.setSelectionMode("
                           "QAbstractItemView.SelectionMode.NoSelection)")
        else:
            self.body.line(f"self.{var}.setSelectionBehavior("
                           "QAbstractItemView.SelectionBehavior.SelectRows)")
        self._finish(widget, var)

    def emit_tree_view(self, widget: Widget, parent: str) -> None:
        self._need("QTreeWidget", "QTreeWidgetItem")
        var = self._emit(widget, parent, "QTreeWidget")
        self.body.line(f"self.{var}.setHeaderHidden("
                       f"{not widget.props.get('showRoot', True)})")
        items = [str(i) for i in widget.props.get("items", [])]
        if items:
            self.body.comment("Sample nodes; replace with your own model.")
            stack: list[tuple[int, str]] = []
            for index, raw in enumerate(items):
                depth = (len(raw) - len(raw.lstrip())) // 2
                while stack and stack[-1][0] >= depth:
                    stack.pop()
                owner = f"self.{stack[-1][1]}" if stack else f"self.{var}"
                node = f"{var}_node{index}"
                self.body.line(f"self.{node} = QTreeWidgetItem({owner}, "
                               f"[{py_string(raw.strip())}])")
                stack.append((depth, node))
            self.body.line(f"self.{var}.expandAll()")
        self._finish(widget, var)

    # -- navigation ---------------------------------------------------------

    def emit_menu_bar(self, widget: Widget, parent: str) -> None:
        self.gen.uses_menu_bar = True
        var = self.var(widget)
        self.body.line(f"self.{var} = self.menuBar()")
        for item in widget.props.get("items", []):
            menu = f"{var}_{snake(str(item), 'menu')}"
            self.body.line(f"self.{menu} = self.{var}.addMenu({py_string(str(item))})")
        self.body.blank()

    def emit_toolbar(self, widget: Widget, parent: str) -> None:
        self._need("QToolBar")
        self.gen.uses_toolbar = True
        var = self.var(widget)
        self.body.line(f"self.{var} = QToolBar({py_string(widget.text or 'Toolbar')}, self)")
        self.body.line(f"self.addToolBar(self.{var})")
        self.body.blank()
        if widget.children:
            self.deferred.append((widget, var))
            self.body.line(f"self._build_{var}()")
            self.body.blank()

    def emit_status_bar(self, widget: Widget, parent: str) -> None:
        self.gen.uses_status_bar = True
        var = self.var(widget)
        self.body.line(f"self.{var} = self.statusBar()")
        self.body.line(f"self.{var}.showMessage({py_string(widget.text or 'Ready')})")
        self.body.blank()

    def emit_sidebar(self, widget: Widget, parent: str) -> None:
        self._need("QListWidget")
        var = self._emit(widget, parent, "QListWidget")
        items = [str(i) for i in widget.props.get("items", [])]
        if items:
            self.body.line(f"self.{var}.addItems([{', '.join(py_string(i) for i in items)}])")
        self._finish(widget, var)
        if widget.children:
            self.gen.warn("A Qt QListWidget sidebar cannot host arbitrary children; "
                          "child widgets were skipped.", widget.id)

    # -- advanced -----------------------------------------------------------

    def emit_canvas(self, widget: Widget, parent: str) -> None:
        self._need("QGraphicsView", "QGraphicsScene")
        var = self._emit(widget, parent, "QGraphicsView")
        self.body.line(f"self.{var}_scene = QGraphicsScene(self)")
        self.body.line(f"self.{var}.setScene(self.{var}_scene)")
        self._finish(widget, var)

    def emit_open_gl_view(self, widget: Widget, parent: str) -> None:
        self.gen.needs_opengl = True
        var = self._emit(widget, parent, "QOpenGLWidget")
        self._finish(widget, var)

    def emit_markdown_viewer(self, widget: Widget, parent: str) -> None:
        self._need("QTextBrowser")
        var = self._emit(widget, parent, "QTextBrowser")
        content = str(widget.props.get("content", ""))
        self.body.line(f"self.{var}.setMarkdown({py_string(content)})")
        self._finish(widget, var)

    def emit_web_view(self, widget: Widget, parent: str) -> None:
        self.gen.warn("Web view requires PyQt6-WebEngine; emitted a QTextBrowser "
                      "placeholder to keep the file runnable.", widget.id)
        self._need("QTextBrowser")
        var = self._emit(widget, parent, "QTextBrowser")
        url = str(widget.props.get("url", ""))
        self.body.line(f"self.{var}.setHtml({py_string(f'<p>Web view: {url}</p>')})")
        self._finish(widget, var)

    # -- fallback -----------------------------------------------------------

    def emit_fallback(self, widget: Widget, parent: str) -> None:
        self.gen.unsupported(widget.type, widget.id)
        self._need("QLabel")
        var = self._emit(widget, parent, "QLabel",
                         py_string(widget.text or widget.type))
        self.body.line(f"self.{var}.setStyleSheet('border: 1px dashed #888;')")
        self._finish(widget, var)


@registry.register
class PyQt6Generator(CodeGenerator):
    info = GeneratorInfo(
        id="pyqt6",
        label="PyQt6",
        language="python",
        language_label="Python",
        extension=".py",
        monaco_language="python",
        description="Qt 6 bindings for Python. Native look, rich widget set.",
        features=["signals & slots", "stylesheets", "QMainWindow"],
    )

    def __init__(self) -> None:
        super().__init__()
        self.button_groups: dict[str, list[str]] = {}
        self.uses_menu_bar = False
        self.uses_toolbar = False
        self.uses_status_bar = False
        self.needs_color_dialog = False
        self.needs_opengl = False

    def generate(self, project: Project) -> list[GeneratedFile]:
        visitor = _QtVisitor(self)
        window = next((w for w in project.widgets if w.type == "window"), None)
        for widget in (window.children if window else project.widgets):
            visitor.visit(widget, "self.central")

        container_methods: list[tuple[str, str]] = []
        while visitor.deferred:
            container, var = visitor.deferred.pop(0)
            nested = CodeWriter()
            outer, visitor.body = visitor.body, nested
            for child in container.children:
                visitor.visit(child, f"self.{var}")
            visitor.body = outer
            container_methods.append((var, nested.render()))

        return [
            GeneratedFile("main.py",
                          self._assemble(project, window, visitor, container_methods),
                          "python"),
            GeneratedFile("requirements.txt",
                          "PyQt6>=6.6.0\n" + ("PyQt6-WebEngine>=6.6.0\n"
                                              if self.needs_opengl else ""),
                          "text"),
        ]

    def _assemble(self, project: Project, window, visitor: _QtVisitor,
                  container_methods: list[tuple[str, str]]) -> str:
        spec = project.window
        title = window.text if window and window.text else spec.title
        class_name = _qt_class_name(project.project.name)
        writer = CodeWriter()

        writer.docstring(
            f"{project.project.name}\n\n"
            f"{project.project.description or 'Generated by GUIForge.'}\n\n"
            "Requires PyQt6:  pip install PyQt6"
        )
        writer.blank()
        writer.line("import sys")
        writer.blank()
        widgets_import = sorted(visitor.imports)
        writer.line(_wrap_import("from PyQt6.QtWidgets import", widgets_import))
        if visitor.core_imports:
            writer.line(_wrap_import("from PyQt6.QtCore import",
                                     sorted(visitor.core_imports)))
        if visitor.gui_imports:
            writer.line(_wrap_import("from PyQt6.QtGui import", sorted(visitor.gui_imports)))
        if self.needs_opengl:
            writer.line("from PyQt6.QtOpenGLWidgets import QOpenGLWidget")
        writer.blank(2)

        with writer.block(f"class {class_name}(QMainWindow):"):
            writer.docstring(f"Main application window for {project.project.name}.")
            writer.blank()
            with writer.block("def __init__(self) -> None:"):
                writer.line("super().__init__()")
                writer.line(f"self.setWindowTitle({py_string(title)})")
                writer.line(f"self.resize({spec.width}, {spec.height})")
                if not spec.resizable:
                    writer.line(f"self.setFixedSize({spec.width}, {spec.height})")
                if spec.min_width and spec.min_height:
                    writer.line(f"self.setMinimumSize({spec.min_width}, {spec.min_height})")
                if bg := to_hex(spec.background):
                    writer.line(f"self.setStyleSheet({py_string(f'background-color: {bg};')})")
                writer.blank()
                writer.comment("QMainWindow needs an explicit central widget for "
                               "absolutely-positioned children.")
                writer.line("self.central = QWidget(self)")
                writer.line("self.setCentralWidget(self.central)")
                writer.blank()
                writer.line("self._build_ui()")
                writer.line("self._connect_signals()")
            writer.blank()

            writer.banner("UI construction")
            writer.blank()
            with writer.block("def _build_ui(self) -> None:"):
                writer.docstring("Create and position the top-level widgets.")
                body = visitor.body.render().rstrip()
                writer.line(body if body else "pass")
                if self.button_groups:
                    writer.blank()
                    writer.comment("Radio buttons are grouped so selection is exclusive.")
                    for group, members in self.button_groups.items():
                        writer.line(f"self.{group} = QButtonGroup(self)")
                        for member in members:
                            writer.line(f"self.{group}.addButton(self.{member})")

            for var, source in container_methods:
                writer.blank()
                with writer.block(f"def _build_{var}(self) -> None:"):
                    writer.docstring(f"Populate the '{var}' container.")
                    content = source.rstrip()
                    writer.line(content if content else "pass")

            writer.blank()
            with writer.block("def _connect_signals(self) -> None:"):
                writer.docstring("Wire widget signals to their handler methods.")
                if visitor.connections:
                    for connection in visitor.connections:
                        writer.line(connection)
                else:
                    writer.line("pass")

            if self.needs_color_dialog:
                writer.blank()
                with writer.block("def _pick_color(self, target: str) -> None:"):
                    writer.docstring("Show the color dialog and tint the source button.")
                    writer.line("current = getattr(self, f\"{target}_color\")")
                    writer.line("chosen = QColorDialog.getColor(current, self)")
                    with writer.block("if chosen.isValid():"):
                        writer.line('setattr(self, f"{target}_color", chosen)')
                        writer.line("getattr(self, target).setStyleSheet(")
                        writer.line('    f"background-color: {chosen.name()};"')
                        writer.line(")")

            handlers = collect_event_handlers(project)
            writer.blank()
            writer.banner("Slots")
            if not handlers:
                writer.blank()
                writer.comment("No events are wired up yet.")
            for name, owner, event in handlers:
                writer.blank()
                with writer.block(f"def {name}(self, *args) -> None:"):
                    writer.docstring(f"Handle the '{event}' event of {owner}.")
                    writer.line(f'raise NotImplementedError("TODO: implement {name}()")')

        writer.blank(2)
        with writer.block("def main() -> int:"):
            writer.docstring("Application entry point.")
            writer.line("app = QApplication(sys.argv)")
            writer.line(f"window = {class_name}()")
            writer.line("window.show()")
            writer.line("return app.exec()")
        writer.blank(2)
        with writer.block('if __name__ == "__main__":'):
            writer.line("sys.exit(main())")
        return writer.render()


def _wrap_import(prefix: str, names: list[str]) -> str:
    single = f"{prefix} {', '.join(names)}"
    if len(single) <= 88:
        return single
    body = "\n".join(f"    {name}," for name in names)
    return f"{prefix} (\n{body}\n)"


def _qt_class_name(project_name: str) -> str:
    name = pascal(project_name, "MainWindow")
    return name if name.endswith(("Window", "App")) else f"{name}Window"
