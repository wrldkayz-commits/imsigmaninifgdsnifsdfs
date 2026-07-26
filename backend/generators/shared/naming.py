"""Identifier hygiene.

Designers type whatever they like into the Name field; generators need valid,
unique, non-reserved identifiers in several casing conventions. Centralising
this means every framework produces consistent names for the same project.
"""

from __future__ import annotations

import keyword
import re

_INVALID = re.compile(r"[^0-9a-zA-Z_]+")
_CAMEL_BOUNDARY = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")

# Reserved across the languages we target, so a widget named "class" or
# "namespace" is safe everywhere.
_RESERVED = set(keyword.kwlist) | {
    "self", "cls", "None", "True", "False",
    "class", "struct", "namespace", "template", "public", "private", "operator",
    "int", "float", "bool", "char", "void", "static", "const", "new", "delete",
}


def snake(text: str, fallback: str = "widget") -> str:
    """`My Save Button` / `mySaveButton` -> `my_save_button`."""
    text = _CAMEL_BOUNDARY.sub("_", text.strip())
    text = _INVALID.sub("_", text).strip("_").lower()
    text = re.sub(r"_+", "_", text)
    if not text or text[0].isdigit():
        text = f"{fallback}_{text}" if text else fallback
    if text in _RESERVED:
        text += "_"
    return text


def pascal(text: str, fallback: str = "Widget") -> str:
    parts = [p for p in snake(text, fallback).split("_") if p]
    name = "".join(p[:1].upper() + p[1:] for p in parts)
    return name or fallback


def camel(text: str, fallback: str = "widget") -> str:
    name = pascal(text, fallback)
    return name[:1].lower() + name[1:]


class NameAllocator:
    """Hands out unique identifiers within one generated file.

    Two widgets both named "Submit" must not collide, and a widget must keep the
    same identifier every time it is referenced, so results are memoised by id.
    """

    def __init__(self, style=snake) -> None:
        self._style = style
        self._used: set[str] = set()
        self._assigned: dict[str, str] = {}

    def reserve(self, *names: str) -> None:
        self._used.update(names)

    def allocate(self, key: str, desired: str, fallback: str = "widget") -> str:
        if key in self._assigned:
            return self._assigned[key]
        base = self._style(desired or fallback, fallback)
        name, counter = base, 2
        while name in self._used:
            name = f"{base}_{counter}"
            counter += 1
        self._used.add(name)
        self._assigned[key] = name
        return name

    def get(self, key: str) -> str | None:
        return self._assigned.get(key)


def py_string(value: str) -> str:
    """Quote a Python string literal, preferring double quotes."""
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    escaped = escaped.replace("\n", "\\n").replace("\t", "\\t").replace("\r", "")
    return f'"{escaped}"'


def cpp_string(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    escaped = escaped.replace("\n", "\\n").replace("\t", "\\t").replace("\r", "")
    return f'"{escaped}"'
