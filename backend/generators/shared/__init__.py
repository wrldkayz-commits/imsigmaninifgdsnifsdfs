"""Reusable building blocks for code generators."""

from .color import contrast_ratio, to_float_tuple, to_hex, to_rgba_ints
from .naming import NameAllocator, camel, cpp_string, pascal, py_string, snake
from .visitor import WidgetVisitor, collect_event_handlers, root_windows, visible_children
from .writer import CodeWriter

__all__ = [
    "CodeWriter",
    "NameAllocator",
    "WidgetVisitor",
    "camel",
    "collect_event_handlers",
    "contrast_ratio",
    "cpp_string",
    "pascal",
    "py_string",
    "root_windows",
    "snake",
    "to_float_tuple",
    "to_hex",
    "to_rgba_ints",
    "visible_children",
]
