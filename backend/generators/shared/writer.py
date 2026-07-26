"""Indentation-aware source buffer shared by all generators.

Keeps emitted code correctly formatted without every generator hand-managing
whitespace, and provides small conveniences (blank-line collapsing, comment
banners, brace/colon blocks) that make output look hand-written.
"""

from __future__ import annotations

from contextlib import contextmanager


class CodeWriter:
    def __init__(self, indent: str = "    ") -> None:
        self._lines: list[str] = []
        self._indent_unit = indent
        self._level = 0

    # -- writing ------------------------------------------------------------

    def line(self, text: str = "") -> "CodeWriter":
        if not text:
            self._lines.append("")
        else:
            prefix = self._indent_unit * self._level
            self._lines.extend(prefix + part if part else "" for part in text.split("\n"))
        return self

    def lines(self, *texts: str) -> "CodeWriter":
        for text in texts:
            self.line(text)
        return self

    def blank(self, count: int = 1) -> "CodeWriter":
        """Add blank lines, collapsing so we never emit more than requested."""
        while self._lines and self._lines[-1] == "":
            self._lines.pop()
        if self._lines:
            self._lines.extend([""] * count)
        return self

    def comment(self, text: str, marker: str = "#") -> "CodeWriter":
        for part in text.split("\n"):
            self.line(f"{marker} {part}".rstrip())
        return self

    def banner(self, text: str, marker: str = "#", width: int = 76) -> "CodeWriter":
        rule = marker + " " + "-" * max(0, width - len(text) - len(marker) - 3)
        self.line(f"{marker} {text} {rule[len(marker) + 1:]}".rstrip())
        return self

    def docstring(self, text: str) -> "CodeWriter":
        if "\n" in text:
            self.line('"""' + text.split("\n")[0])
            for part in text.split("\n")[1:]:
                self.line(part)
            self.line('"""')
        else:
            self.line(f'"""{text}"""')
        return self

    # -- structure ----------------------------------------------------------

    def indent(self) -> "CodeWriter":
        self._level += 1
        return self

    def dedent(self) -> "CodeWriter":
        self._level = max(0, self._level - 1)
        return self

    @contextmanager
    def block(self, header: str | None = None):
        """Python-style indented block."""
        if header is not None:
            self.line(header)
        self.indent()
        try:
            yield self
        finally:
            self.dedent()

    @contextmanager
    def braces(self, header: str, *, semicolon: bool = False):
        """C-style brace block, Allman braces (matches the Dear ImGui house style)."""
        self.line(header)
        self.line("{")
        self.indent()
        try:
            yield self
        finally:
            self.dedent()
            self.line("};" if semicolon else "}")

    # -- output -------------------------------------------------------------

    def render(self) -> str:
        while self._lines and self._lines[-1] == "":
            self._lines.pop()
        return "\n".join(self._lines) + "\n"

    def __str__(self) -> str:  # pragma: no cover - convenience
        return self.render()
