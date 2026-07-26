"""The widget catalog: the single source of truth for what a widget *is*.

The frontend renders its widget library, its property inspector and its canvas
previews entirely from this catalog, fetched over `/api/catalog`. That is what
keeps framework knowledge out of the frontend: adding a widget type (or a whole
plugin's worth of them) never requires a frontend change.

Each `WidgetSpec` declares:
  * where it lives in the library (category, icon, keywords for search)
  * whether it can contain children, and which children it accepts
  * its default geometry
  * its type-specific property schema, as `PropDef`s the inspector can render
  * which events it can raise
"""

from __future__ import annotations

from enum import Enum

from pydantic import Field

from .schema import BaseModel, EventName  # BaseModel serialises as camelCase


class Category(str, Enum):
    CONTAINERS = "Containers"
    INPUTS = "Inputs"
    BUTTONS = "Buttons"
    DISPLAY = "Display"
    NAVIGATION = "Navigation"
    MEDIA = "Media"
    ADVANCED = "Advanced"
    CUSTOM = "Custom"


class PropType(str, Enum):
    """Editor widget the inspector should render for a property."""

    STRING = "string"
    TEXT = "text"
    NUMBER = "number"
    BOOLEAN = "boolean"
    SELECT = "select"
    COLOR = "color"
    STRING_LIST = "stringList"
    FONT = "font"
    IMAGE = "image"


class PropDef(BaseModel):
    key: str
    label: str
    type: PropType
    default: object = None
    options: list[str] = Field(default_factory=list)
    min: float | None = None
    max: float | None = None
    step: float | None = None
    group: str = "General"
    help: str = ""


class WidgetSpec(BaseModel):
    type: str
    label: str
    category: Category
    icon: str = "square"
    description: str = ""
    keywords: list[str] = Field(default_factory=list)

    container: bool = False
    accepts: list[str] | None = None  # None = accepts any child
    max_children: int | None = None
    root_only: bool = False  # e.g. Window
    resizable: bool = True

    default_size: tuple[int, int] = (120, 32)
    default_text: str = ""
    props: list[PropDef] = Field(default_factory=list)
    events: list[EventName] = Field(default_factory=list)

    def default_props(self) -> dict:
        return {p.key: p.default for p in self.props if p.default is not None}


# --- shared property fragments -------------------------------------------------

_CLICKY = [EventName.CLICK, EventName.DOUBLE_CLICK, EventName.HOVER,
           EventName.MOUSE_ENTER, EventName.MOUSE_LEAVE]
_EDITABLE = [EventName.CHANGE, EventName.FOCUS, EventName.BLUR, EventName.KEY_PRESS]


def _placeholder(default: str = "") -> PropDef:
    return PropDef(key="placeholder", label="Placeholder", type=PropType.STRING,
                   default=default, group="Content")


def _items(default: list[str]) -> PropDef:
    return PropDef(key="items", label="Items", type=PropType.STRING_LIST,
                   default=default, group="Content")


def _orientation() -> PropDef:
    return PropDef(key="orientation", label="Orientation", type=PropType.SELECT,
                   default="horizontal", options=["horizontal", "vertical"],
                   group="Layout")


def _numeric_range(lo: float = 0, hi: float = 100, value: float = 50) -> list[PropDef]:
    return [
        PropDef(key="min", label="Minimum", type=PropType.NUMBER, default=lo, group="Range"),
        PropDef(key="max", label="Maximum", type=PropType.NUMBER, default=hi, group="Range"),
        PropDef(key="value", label="Value", type=PropType.NUMBER, default=value, group="Range"),
        PropDef(key="step", label="Step", type=PropType.NUMBER, default=1, group="Range"),
    ]


# --- the catalog ---------------------------------------------------------------

WIDGET_SPECS: list[WidgetSpec] = [
    # ---------------- Containers ----------------
    WidgetSpec(
        type="window", label="Window", category=Category.CONTAINERS, icon="app-window",
        description="Top-level application window.", container=True, root_only=True,
        default_size=(800, 560), default_text="Main Window",
        keywords=["root", "form", "dialog"],
        props=[
            PropDef(key="resizable", label="Resizable", type=PropType.BOOLEAN, default=True),
            PropDef(key="centered", label="Center on screen", type=PropType.BOOLEAN, default=True),
        ],
        events=[EventName.WINDOW_OPEN, EventName.WINDOW_CLOSE],
    ),
    WidgetSpec(
        type="frame", label="Frame", category=Category.CONTAINERS, icon="square",
        description="Generic rectangular container.", container=True,
        default_size=(280, 180), keywords=["box", "div", "container"],
        props=[PropDef(key="relief", label="Relief", type=PropType.SELECT, default="flat",
                       options=["flat", "raised", "sunken", "groove", "ridge"])],
        events=_CLICKY,
    ),
    WidgetSpec(
        type="group", label="Group Box", category=Category.CONTAINERS, icon="group",
        description="Titled container that groups related controls.", container=True,
        default_size=(280, 180), default_text="Group",
        keywords=["fieldset", "labelframe", "groupbox"], events=_CLICKY,
    ),
    WidgetSpec(
        type="panel", label="Panel", category=Category.CONTAINERS, icon="layout-panel-left",
        description="Surface panel with padding and background.", container=True,
        default_size=(320, 220), keywords=["card", "surface"], events=_CLICKY,
    ),
    WidgetSpec(
        type="tabs", label="Tab View", category=Category.CONTAINERS, icon="folder",
        description="Tabbed container; each child becomes a tab page.", container=True,
        default_size=(360, 240), keywords=["notebook", "tabview", "pages"],
        props=[_items(["Tab 1", "Tab 2"]),
               PropDef(key="tabPosition", label="Tab Position", type=PropType.SELECT,
                       default="top", options=["top", "bottom", "left", "right"])],
        events=[EventName.CHANGE],
    ),
    WidgetSpec(
        type="scrollArea", label="Scroll Area", category=Category.CONTAINERS, icon="scroll",
        description="Scrollable viewport for oversized content.", container=True,
        default_size=(300, 220), keywords=["scroll", "viewport"],
        props=[PropDef(key="horizontalScroll", label="Horizontal Scrollbar",
                       type=PropType.BOOLEAN, default=False)],
    ),
    WidgetSpec(
        type="splitter", label="Splitter", category=Category.CONTAINERS, icon="columns",
        description="Resizable split between two or more panes.", container=True,
        default_size=(400, 240), keywords=["paned", "split", "divider"],
        props=[_orientation()],
    ),

    # ---------------- Inputs ----------------
    WidgetSpec(
        type="textbox", label="Text Box", category=Category.INPUTS, icon="type",
        default_size=(200, 32), keywords=["entry", "input", "lineedit"],
        props=[_placeholder("Enter text"),
               PropDef(key="value", label="Value", type=PropType.STRING, default="",
                       group="Content"),
               PropDef(key="readOnly", label="Read Only", type=PropType.BOOLEAN,
                       default=False, group="Behavior")],
        events=_EDITABLE,
    ),
    WidgetSpec(
        type="passwordBox", label="Password Box", category=Category.INPUTS, icon="key-round",
        default_size=(200, 32), keywords=["password", "secret", "masked"],
        props=[_placeholder("Password"),
               PropDef(key="maskChar", label="Mask Character", type=PropType.STRING,
                       default="•", group="Content")],
        events=_EDITABLE,
    ),
    WidgetSpec(
        type="multilineText", label="Multiline Text", category=Category.INPUTS, icon="align-left",
        default_size=(260, 120), keywords=["textarea", "textedit", "notes"],
        props=[_placeholder(""),
               PropDef(key="value", label="Value", type=PropType.TEXT, default="",
                       group="Content"),
               PropDef(key="wrap", label="Word Wrap", type=PropType.BOOLEAN, default=True)],
        events=_EDITABLE,
    ),
    WidgetSpec(
        type="numberInput", label="Number Input", category=Category.INPUTS, icon="hash",
        default_size=(140, 32), keywords=["spinbox", "spinner", "numeric"],
        props=_numeric_range(0, 100, 0), events=_EDITABLE,
    ),
    WidgetSpec(
        type="slider", label="Slider", category=Category.INPUTS, icon="sliders-horizontal",
        default_size=(200, 28), keywords=["range", "scale", "seek"],
        props=[*_numeric_range(0, 100, 50), _orientation()], events=[EventName.CHANGE],
    ),
    WidgetSpec(
        type="checkbox", label="Checkbox", category=Category.INPUTS, icon="check-square",
        default_size=(150, 26), default_text="Checkbox", keywords=["check", "toggle", "boolean"],
        props=[PropDef(key="checked", label="Checked", type=PropType.BOOLEAN, default=False)],
        events=[EventName.CHANGE, EventName.CLICK],
    ),
    WidgetSpec(
        type="radioButton", label="Radio Button", category=Category.INPUTS, icon="circle-dot",
        default_size=(150, 26), default_text="Option", keywords=["radio", "choice", "option"],
        props=[PropDef(key="group", label="Group Name", type=PropType.STRING, default="group1"),
               PropDef(key="checked", label="Selected", type=PropType.BOOLEAN, default=False),
               PropDef(key="value", label="Value", type=PropType.STRING, default="option1")],
        events=[EventName.CHANGE, EventName.CLICK],
    ),
    WidgetSpec(
        type="comboBox", label="Combo Box", category=Category.INPUTS, icon="chevron-down",
        default_size=(180, 32), keywords=["dropdown", "select", "option menu"],
        props=[_items(["Option 1", "Option 2", "Option 3"]),
               PropDef(key="selected", label="Selected Index", type=PropType.NUMBER,
                       default=0, group="Content"),
               PropDef(key="editable", label="Editable", type=PropType.BOOLEAN,
                       default=False, group="Behavior")],
        events=[EventName.CHANGE],
    ),
    WidgetSpec(
        type="colorPicker", label="Color Picker", category=Category.INPUTS, icon="palette",
        default_size=(160, 32), keywords=["color", "swatch", "chooser"],
        props=[PropDef(key="value", label="Color", type=PropType.COLOR, default="#3b82f6")],
        events=[EventName.CHANGE],
    ),
    WidgetSpec(
        type="datePicker", label="Date Picker", category=Category.INPUTS, icon="calendar",
        default_size=(180, 32), keywords=["date", "calendar", "day"],
        props=[PropDef(key="format", label="Format", type=PropType.STRING, default="yyyy-MM-dd"),
               PropDef(key="value", label="Value", type=PropType.STRING, default="")],
        events=[EventName.CHANGE],
    ),

    # ---------------- Buttons ----------------
    WidgetSpec(
        type="button", label="Button", category=Category.BUTTONS, icon="mouse-pointer-click",
        default_size=(140, 36), default_text="Button", keywords=["push", "submit", "action"],
        props=[PropDef(key="variant", label="Variant", type=PropType.SELECT, default="primary",
                       options=["primary", "secondary", "outline", "ghost", "danger"]),
               PropDef(key="icon", label="Icon", type=PropType.STRING, default="",
                       group="Content")],
        events=_CLICKY,
    ),
    WidgetSpec(
        type="toggleButton", label="Toggle Button", category=Category.BUTTONS, icon="toggle-left",
        default_size=(140, 36), default_text="Toggle", keywords=["switch", "toggle", "on off"],
        props=[PropDef(key="checked", label="Pressed", type=PropType.BOOLEAN, default=False)],
        events=[EventName.CHANGE, EventName.CLICK],
    ),
    WidgetSpec(
        type="iconButton", label="Icon Button", category=Category.BUTTONS, icon="star",
        default_size=(40, 40), keywords=["icon", "tool", "small button"],
        props=[PropDef(key="icon", label="Icon", type=PropType.STRING, default="star",
                       group="Content"),
               PropDef(key="flat", label="Flat", type=PropType.BOOLEAN, default=True)],
        events=_CLICKY,
    ),

    # ---------------- Display ----------------
    WidgetSpec(
        type="label", label="Label", category=Category.DISPLAY, icon="tag",
        default_size=(120, 24), default_text="Label", keywords=["text", "caption", "static"],
        props=[PropDef(key="align", label="Alignment", type=PropType.SELECT, default="left",
                       options=["left", "center", "right"])],
        events=_CLICKY,
    ),
    WidgetSpec(
        type="image", label="Image", category=Category.MEDIA, icon="image",
        default_size=(160, 120), keywords=["picture", "photo", "bitmap"],
        props=[PropDef(key="source", label="Source", type=PropType.IMAGE, default="",
                       group="Content"),
               PropDef(key="fit", label="Fit", type=PropType.SELECT, default="contain",
                       options=["contain", "cover", "fill", "none"])],
        events=_CLICKY,
    ),
    WidgetSpec(
        type="progressBar", label="Progress Bar", category=Category.DISPLAY, icon="loader",
        default_size=(220, 16), keywords=["progress", "loading", "bar"],
        props=[*_numeric_range(0, 100, 40),
               PropDef(key="indeterminate", label="Indeterminate", type=PropType.BOOLEAN,
                       default=False)],
    ),
    WidgetSpec(
        type="spinner", label="Spinner", category=Category.DISPLAY, icon="loader-circle",
        default_size=(40, 40), keywords=["busy", "activity", "loading"],
        props=[PropDef(key="running", label="Running", type=PropType.BOOLEAN, default=True)],
    ),
    WidgetSpec(
        type="separator", label="Separator", category=Category.DISPLAY, icon="minus",
        default_size=(220, 2), keywords=["divider", "rule", "line"],
        props=[_orientation()],
    ),
    WidgetSpec(
        type="table", label="Table", category=Category.DISPLAY, icon="table",
        default_size=(360, 200), keywords=["grid", "treeview", "datagrid", "list"],
        props=[PropDef(key="columns", label="Columns", type=PropType.STRING_LIST,
                       default=["Name", "Value"], group="Content"),
               PropDef(key="rows", label="Placeholder Rows", type=PropType.NUMBER,
                       default=5, group="Content"),
               PropDef(key="selectable", label="Selectable", type=PropType.BOOLEAN, default=True)],
        events=[EventName.CHANGE, EventName.DOUBLE_CLICK],
    ),
    WidgetSpec(
        type="treeView", label="Tree View", category=Category.DISPLAY, icon="list-tree",
        default_size=(240, 220), keywords=["tree", "hierarchy", "explorer"],
        props=[_items(["Root", "  Child A", "  Child B"]),
               PropDef(key="showRoot", label="Show Root", type=PropType.BOOLEAN, default=True)],
        events=[EventName.CHANGE, EventName.DOUBLE_CLICK],
    ),

    # ---------------- Navigation ----------------
    WidgetSpec(
        type="menuBar", label="Menu Bar", category=Category.NAVIGATION, icon="menu",
        default_size=(800, 28), keywords=["menu", "file edit view"],
        props=[_items(["File", "Edit", "View", "Help"])],
        events=[EventName.CLICK],
    ),
    WidgetSpec(
        type="toolbar", label="Toolbar", category=Category.NAVIGATION, icon="wrench",
        description="Horizontal strip of tool buttons.", container=True,
        default_size=(800, 40), keywords=["tools", "actions", "ribbon"],
        props=[_orientation()],
    ),
    WidgetSpec(
        type="statusBar", label="Status Bar", category=Category.NAVIGATION, icon="panel-bottom",
        default_size=(800, 26), default_text="Ready", keywords=["status", "footer"],
    ),
    WidgetSpec(
        type="sidebar", label="Sidebar", category=Category.NAVIGATION, icon="panel-left",
        description="Vertical navigation rail.", container=True,
        default_size=(200, 480), keywords=["nav", "rail", "drawer"],
        props=[_items(["Home", "Library", "Settings"])],
        events=[EventName.CHANGE],
    ),

    # ---------------- Advanced ----------------
    WidgetSpec(
        type="canvas", label="Canvas", category=Category.ADVANCED, icon="pen-tool",
        default_size=(320, 240), keywords=["draw", "paint", "custom"],
        props=[PropDef(key="background", label="Canvas Background", type=PropType.COLOR,
                       default="#ffffff")],
        events=[*_CLICKY, EventName.KEY_PRESS],
    ),
    WidgetSpec(
        type="openGLView", label="OpenGL View", category=Category.ADVANCED, icon="box",
        default_size=(320, 240), keywords=["gl", "3d", "render", "viewport"],
        props=[PropDef(key="fps", label="Target FPS", type=PropType.NUMBER, default=60)],
    ),
    WidgetSpec(
        type="markdownViewer", label="Markdown Viewer", category=Category.ADVANCED, icon="file-text",
        default_size=(320, 240), keywords=["markdown", "docs", "richtext"],
        props=[PropDef(key="content", label="Content", type=PropType.TEXT,
                       default="# Heading\n\nSome text.", group="Content")],
    ),
    WidgetSpec(
        type="webView", label="Web View", category=Category.ADVANCED, icon="globe",
        default_size=(360, 260), keywords=["browser", "html", "embed"],
        props=[PropDef(key="url", label="URL", type=PropType.STRING,
                       default="https://example.com", group="Content")],
    ),
]

WIDGET_INDEX: dict[str, WidgetSpec] = {spec.type: spec for spec in WIDGET_SPECS}


def get_spec(widget_type: str) -> WidgetSpec | None:
    return WIDGET_INDEX.get(widget_type)


def register_spec(spec: WidgetSpec, *, replace: bool = False) -> None:
    """Entry point used by plugins to contribute new widget types."""
    if spec.type in WIDGET_INDEX and not replace:
        raise ValueError(f"Widget type '{spec.type}' is already registered")
    if spec.type not in WIDGET_INDEX:
        WIDGET_SPECS.append(spec)
    else:
        WIDGET_SPECS[:] = [s if s.type != spec.type else spec for s in WIDGET_SPECS]
    WIDGET_INDEX[spec.type] = spec
