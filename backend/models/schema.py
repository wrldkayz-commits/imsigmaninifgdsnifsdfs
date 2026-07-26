"""Versioned project schema for GUIForge.

The document format is intentionally framework-agnostic: it describes *intent*
(a widget tree with generic properties), never framework-specific code. Every
code generator is responsible for translating this document into its own
idioms.

Schema versioning contract
--------------------------
`SCHEMA_VERSION` is bumped whenever the persisted shape changes. Loaders run
every registered migration in `migrations.py` in order, so older project files
keep opening in newer releases.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel as PydanticBaseModel
from pydantic import ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

SCHEMA_VERSION = 1


class BaseModel(PydanticBaseModel):
    """Project models serialise as camelCase.

    Python code stays snake_case; the JSON the frontend and the saved `.guiforge`
    files use stays camelCase, so the TypeScript interfaces need no translation
    layer. `populate_by_name` keeps snake_case input valid too, which matters for
    hand-written project files and older exports.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Point(BaseModel):
    x: float = 0
    y: float = 0


class Size(BaseModel):
    width: float = 100
    height: float = 30


class Box(BaseModel):
    """Four-sided spacing value (padding / margin / border width)."""

    top: float = 0
    right: float = 0
    bottom: float = 0
    left: float = 0

    @property
    def uniform(self) -> float | None:
        """Return the single value if all sides match, else ``None``."""
        if self.top == self.right == self.bottom == self.left:
            return self.top
        return None


class Anchor(str, Enum):
    """How a widget behaves when its parent container resizes."""

    TOP_LEFT = "top-left"
    TOP = "top"
    TOP_RIGHT = "top-right"
    LEFT = "left"
    CENTER = "center"
    RIGHT = "right"
    BOTTOM_LEFT = "bottom-left"
    BOTTOM = "bottom"
    BOTTOM_RIGHT = "bottom-right"
    FILL = "fill"


class EventName(str, Enum):
    CLICK = "click"
    DOUBLE_CLICK = "doubleClick"
    HOVER = "hover"
    KEY_PRESS = "keyPress"
    MOUSE_ENTER = "mouseEnter"
    MOUSE_LEAVE = "mouseLeave"
    CHANGE = "change"
    FOCUS = "focus"
    BLUR = "blur"
    WINDOW_OPEN = "windowOpen"
    WINDOW_CLOSE = "windowClose"


class Font(BaseModel):
    family: str = "Segoe UI"
    size: int = 12
    weight: Literal["normal", "bold"] = "normal"
    style: Literal["normal", "italic"] = "normal"
    underline: bool = False


class Appearance(BaseModel):
    font: Font = Field(default_factory=Font)
    color: str | None = None
    background: str | None = None
    border_color: str | None = None
    border_width: float = 0
    radius: float = 0
    opacity: float = 1.0

    @field_validator("opacity")
    @classmethod
    def _clamp_opacity(cls, v: float) -> float:
        return max(0.0, min(1.0, v))


class Layout(BaseModel):
    position: Point = Field(default_factory=Point)
    size: Size = Field(default_factory=Size)
    anchor: Anchor = Anchor.TOP_LEFT
    padding: Box = Field(default_factory=Box)
    margin: Box = Field(default_factory=Box)


class Behavior(BaseModel):
    visible: bool = True
    enabled: bool = True
    focusable: bool = True
    tab_order: int | None = None
    locked: bool = False


class Widget(BaseModel):
    """A single node in the design tree.

    `type` is a key into the widget catalog (see `models/catalog.py`). `props`
    holds the type-specific values declared by that catalog entry, which keeps
    this model stable as the catalog grows past a hundred widget types.
    """

    id: str
    type: str
    name: str = ""
    text: str = ""
    tooltip: str = ""
    layout: Layout = Field(default_factory=Layout)
    appearance: Appearance = Field(default_factory=Appearance)
    behavior: Behavior = Field(default_factory=Behavior)
    props: dict[str, Any] = Field(default_factory=dict)
    events: dict[str, str] = Field(default_factory=dict)
    children: list["Widget"] = Field(default_factory=list)

    def walk(self):
        """Depth-first iteration over this widget and its descendants."""
        yield self
        for child in self.children:
            yield from child.walk()


Widget.model_rebuild()


class WindowSpec(BaseModel):
    title: str = "Untitled Window"
    width: int = 1024
    height: int = 640
    resizable: bool = True
    background: str = "#ffffff"
    min_width: int | None = None
    min_height: int | None = None


class ThemeSpec(BaseModel):
    """Design tokens. Exported/imported standalone as `theme.json`."""

    name: str = "Default Light"
    mode: Literal["light", "dark"] = "light"
    tokens: dict[str, str] = Field(
        default_factory=lambda: {
            "primary": "#3b82f6",
            "surface": "#ffffff",
            "background": "#f5f5f5",
            "text": "#111827",
            "muted": "#6b7280",
            "border": "#e5e7eb",
        }
    )


class ProjectMeta(BaseModel):
    name: str = "My Application"
    version: int = 1
    author: str = ""
    description: str = ""


class Project(BaseModel):
    schema_version: int = SCHEMA_VERSION
    project: ProjectMeta = Field(default_factory=ProjectMeta)
    window: WindowSpec = Field(default_factory=WindowSpec)
    theme: ThemeSpec = Field(default_factory=ThemeSpec)
    widgets: list[Widget] = Field(default_factory=list)
    assets: dict[str, str] = Field(default_factory=dict)

    def iter_widgets(self):
        for widget in self.widgets:
            yield from widget.walk()

    def find(self, widget_id: str) -> Widget | None:
        return next((w for w in self.iter_widgets() if w.id == widget_id), None)
