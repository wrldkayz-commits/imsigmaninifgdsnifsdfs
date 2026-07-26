"""Widget tree traversal shared by every generator.

Rather than each generator writing its own `if type == ...` ladder, it subclasses
`WidgetVisitor` and defines `emit_<type>` methods. Unknown or unsupported types
fall through to `emit_fallback`, so a generator never crashes on a widget it has
not learned yet — it emits a placeholder and records a diagnostic. That is what
lets the catalog grow past a hundred widget types without touching the older
generators.
"""

from __future__ import annotations

from models.schema import Project, Widget

from .naming import NameAllocator, snake


class WidgetVisitor:
    """Dispatches each widget to `emit_<camelCaseType>`.

    Subclasses get `self.names` for identifier allocation and `self.parent_stack`
    to know their nesting context.
    """

    #: Widget types this generator maps to a real, native control.
    supported: set[str] = set()

    def __init__(self) -> None:
        self.names = NameAllocator()
        self.parent_stack: list[Widget] = []

    # -- traversal ----------------------------------------------------------

    def visit(self, widget: Widget, parent: str) -> None:
        handler = getattr(self, f"emit_{_method_suffix(widget.type)}", None)
        if handler is None or (self.supported and widget.type not in self.supported):
            self.emit_fallback(widget, parent)
        else:
            handler(widget, parent)

    def visit_children(self, widget: Widget, parent_ref: str) -> None:
        self.parent_stack.append(widget)
        try:
            for child in sorted(widget.children, key=_z_key):
                self.visit(child, parent_ref)
        finally:
            self.parent_stack.pop()

    def emit_fallback(self, widget: Widget, parent: str) -> None:
        """Called for widget types this generator does not implement."""
        raise NotImplementedError

    # -- naming -------------------------------------------------------------

    def var(self, widget: Widget) -> str:
        """Stable variable name for a widget, derived from its Name then Text."""
        desired = widget.name or widget.text or widget.type
        return self.names.allocate(widget.id, desired, fallback=snake(widget.type))


def _method_suffix(widget_type: str) -> str:
    return snake(widget_type)


def _z_key(widget: Widget) -> tuple:
    """Children are emitted back-to-front so later widgets draw on top."""
    return (widget.layout.position.y, widget.layout.position.x)


def collect_event_handlers(project: Project) -> list[tuple[str, str, str]]:
    """Every (handler_name, widget_name, event) triple used in the project.

    Generators use this to emit a callbacks section, so handler stubs are
    declared exactly once even when several widgets share one.
    """
    seen: dict[str, tuple[str, str, str]] = {}
    for widget in project.iter_widgets():
        for event, handler in sorted(widget.events.items()):
            if not handler:
                continue
            name = snake(handler, "on_event")
            seen.setdefault(name, (name, widget.name or widget.type, event))
    return list(seen.values())


def visible_children(widget: Widget) -> list[Widget]:
    return [c for c in widget.children if c.behavior.visible]


def root_windows(project: Project) -> list[Widget]:
    """Top-level windows. Loose widgets at the root are wrapped implicitly."""
    return [w for w in project.widgets if w.type == "window"]
