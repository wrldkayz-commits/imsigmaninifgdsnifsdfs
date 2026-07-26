"""Project validation, accessibility checking and statistics.

These power the Errors panel, the Accessibility Checker and the Project
Statistics view. They are pure functions over a `Project`, so they run on save,
on demand, and inside tests without any application state.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

from generators.shared.color import contrast_ratio
from models.catalog import get_spec
from models.schema import Project, Widget


@dataclass(slots=True)
class Issue:
    level: str  # "error" | "warning" | "info"
    code: str
    message: str
    widget_id: str | None = None
    widget_name: str | None = None

    def as_dict(self) -> dict:
        return {
            "level": self.level,
            "code": self.code,
            "message": self.message,
            "widgetId": self.widget_id,
            "widgetName": self.widget_name,
        }


@dataclass(slots=True)
class Statistics:
    widget_count: int = 0
    container_count: int = 0
    max_depth: int = 0
    event_count: int = 0
    unique_handlers: int = 0
    by_type: dict[str, int] = field(default_factory=dict)
    by_category: dict[str, int] = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "widgetCount": self.widget_count,
            "containerCount": self.container_count,
            "maxDepth": self.max_depth,
            "eventCount": self.event_count,
            "uniqueHandlers": self.unique_handlers,
            "byType": self.by_type,
            "byCategory": self.by_category,
        }


# --- validation ----------------------------------------------------------------


def validate(project: Project) -> list[Issue]:
    issues: list[Issue] = []
    seen_ids: set[str] = set()
    seen_names: dict[str, str] = {}

    for widget in project.iter_widgets():
        label = widget.name or widget.text or widget.type

        if widget.id in seen_ids:
            issues.append(Issue("error", "duplicate-id",
                                f"Duplicate widget id '{widget.id}'.", widget.id, label))
        seen_ids.add(widget.id)

        spec = get_spec(widget.type)
        if spec is None:
            issues.append(Issue("error", "unknown-type",
                                f"'{widget.type}' is not a registered widget type. "
                                "Is a plugin missing?", widget.id, label))
            continue

        if widget.name:
            if widget.name in seen_names and seen_names[widget.name] != widget.id:
                issues.append(Issue(
                    "warning", "duplicate-name",
                    f"Two widgets are named '{widget.name}'. Generated variable "
                    "names will be suffixed to keep them unique.", widget.id, label))
            seen_names[widget.name] = widget.id

        if widget.children and not spec.container:
            issues.append(Issue("error", "not-a-container",
                                f"'{spec.label}' cannot contain child widgets.",
                                widget.id, label))

        if spec.accepts is not None:
            for child in widget.children:
                if child.type not in spec.accepts:
                    issues.append(Issue(
                        "error", "invalid-child",
                        f"'{spec.label}' does not accept '{child.type}' children.",
                        child.id, child.name))

        if spec.max_children is not None and len(widget.children) > spec.max_children:
            issues.append(Issue("warning", "too-many-children",
                                f"'{spec.label}' expects at most {spec.max_children} "
                                f"children but has {len(widget.children)}.",
                                widget.id, label))

        size = widget.layout.size
        if size.width <= 0 or size.height <= 0:
            issues.append(Issue("error", "zero-size",
                                "Widget has zero or negative size and will not render.",
                                widget.id, label))

        for event, handler in widget.events.items():
            if handler and not handler.strip():
                issues.append(Issue("warning", "blank-handler",
                                    f"The '{event}' handler name is blank.",
                                    widget.id, label))
            valid_events = {e.value for e in spec.events}
            if valid_events and event not in valid_events:
                issues.append(Issue(
                    "info", "unsupported-event",
                    f"'{spec.label}' does not normally raise '{event}'; "
                    "some frameworks will skip it.", widget.id, label))

    if not any(w.type == "window" for w in project.widgets):
        issues.append(Issue("warning", "no-window",
                            "The project has no Window widget. Generators will wrap "
                            "the design in a default window."))

    return issues


# --- accessibility -------------------------------------------------------------

_MIN_TARGET = 24  # px; the practical floor for a comfortable click target
_MIN_CONTRAST = 4.5  # WCAG AA for normal text
_LARGE_TEXT_CONTRAST = 3.0


def check_accessibility(project: Project) -> list[Issue]:
    issues: list[Issue] = []
    interactive = {"button", "toggleButton", "iconButton", "checkbox", "radioButton",
                   "textbox", "passwordBox", "comboBox", "slider", "datePicker"}

    tab_orders: list[int] = []
    for widget in project.iter_widgets():
        label = widget.name or widget.text or widget.type
        spec = get_spec(widget.type)

        if widget.type in interactive:
            size = widget.layout.size
            if size.width < _MIN_TARGET or size.height < _MIN_TARGET:
                issues.append(Issue(
                    "warning", "small-target",
                    f"Interactive target is {int(size.width)}x{int(size.height)}px; "
                    f"aim for at least {_MIN_TARGET}x{_MIN_TARGET}px.",
                    widget.id, label))

            if not widget.text and not widget.tooltip and widget.type in (
                    "iconButton", "button", "toggleButton"):
                issues.append(Issue(
                    "warning", "unlabelled-control",
                    "Control has no text or tooltip, so screen readers announce "
                    "nothing useful.", widget.id, label))

        if widget.behavior.tab_order is not None:
            tab_orders.append(widget.behavior.tab_order)

        foreground = widget.appearance.color
        background = widget.appearance.background or _inherited_background(project, widget)
        if foreground and background:
            ratio = contrast_ratio(foreground, background)
            threshold = _LARGE_TEXT_CONTRAST if widget.appearance.font.size >= 18 \
                else _MIN_CONTRAST
            if ratio < threshold:
                issues.append(Issue(
                    "warning", "low-contrast",
                    f"Contrast ratio is {ratio:.2f}:1 against its background; "
                    f"{threshold}:1 is the WCAG AA minimum.", widget.id, label))

        if spec and spec.container and not widget.children:
            issues.append(Issue("info", "empty-container",
                                f"'{spec.label}' is empty.", widget.id, label))

    duplicates = [order for order, n in Counter(tab_orders).items() if n > 1]
    for order in duplicates:
        issues.append(Issue("warning", "duplicate-tab-order",
                            f"Tab order {order} is assigned to more than one widget."))

    return issues


def _inherited_background(project: Project, widget: Widget) -> str | None:
    """Walk up to the nearest ancestor that sets a background."""
    parents = _parent_map(project)
    current = parents.get(widget.id)
    while current is not None:
        if current.appearance.background:
            return current.appearance.background
        current = parents.get(current.id)
    return project.window.background


def _parent_map(project: Project) -> dict[str, Widget]:
    mapping: dict[str, Widget] = {}

    def walk(widget: Widget) -> None:
        for child in widget.children:
            mapping[child.id] = widget
            walk(child)

    for root in project.widgets:
        walk(root)
    return mapping


# --- statistics ----------------------------------------------------------------


def statistics(project: Project) -> Statistics:
    stats = Statistics()
    handlers: set[str] = set()
    by_type: Counter[str] = Counter()
    by_category: Counter[str] = Counter()

    def walk(widget: Widget, depth: int) -> None:
        stats.widget_count += 1
        stats.max_depth = max(stats.max_depth, depth)
        by_type[widget.type] += 1
        spec = get_spec(widget.type)
        if spec:
            by_category[spec.category.value] += 1
            if spec.container:
                stats.container_count += 1
        for event, handler in widget.events.items():
            if handler:
                stats.event_count += 1
                handlers.add(handler)
        for child in widget.children:
            walk(child, depth + 1)

    for root in project.widgets:
        walk(root, 1)

    stats.unique_handlers = len(handlers)
    stats.by_type = dict(by_type.most_common())
    stats.by_category = dict(by_category.most_common())
    return stats
