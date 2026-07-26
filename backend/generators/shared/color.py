"""Color conversion helpers.

The document format stores colors as CSS-style hex strings. Each toolkit wants
something different — Tk wants `#rrggbb`, Qt wants a stylesheet string, Dear
PyGui and ImGui want numeric tuples — so all parsing lives here.
"""

from __future__ import annotations

import re

_HEX = re.compile(r"^#?([0-9a-fA-F]{3,8})$")


def parse(value: str | None) -> tuple[int, int, int, int] | None:
    """Parse `#rgb`, `#rrggbb`, or `#rrggbbaa` into an RGBA byte tuple."""
    if not value:
        return None
    match = _HEX.match(value.strip())
    if not match:
        return None
    digits = match.group(1)
    if len(digits) == 3:
        digits = "".join(c * 2 for c in digits)
    if len(digits) == 6:
        digits += "ff"
    if len(digits) != 8:
        return None
    return tuple(int(digits[i:i + 2], 16) for i in (0, 2, 4, 6))  # type: ignore[return-value]


def to_hex(value: str | None, default: str | None = None) -> str | None:
    """Normalise to `#rrggbb`, dropping alpha (most toolkits ignore it)."""
    rgba = parse(value)
    if rgba is None:
        return default
    r, g, b, _ = rgba
    return f"#{r:02x}{g:02x}{b:02x}"


def to_rgba_ints(value: str | None, default: tuple[int, int, int, int] | None = None):
    return parse(value) or default


def to_float_tuple(value: str | None, default=(1.0, 1.0, 1.0, 1.0)) -> tuple[float, ...]:
    """Normalised 0..1 floats, as ImGui's `ImVec4` expects."""
    rgba = parse(value)
    if rgba is None:
        return default
    return tuple(round(c / 255.0, 3) for c in rgba)


def relative_luminance(value: str | None) -> float:
    """WCAG relative luminance, used by the accessibility checker."""
    rgba = parse(value)
    if rgba is None:
        return 1.0

    def channel(c: int) -> float:
        s = c / 255.0
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4

    r, g, b, _ = rgba
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast_ratio(foreground: str | None, background: str | None) -> float:
    lo, hi = sorted((relative_luminance(foreground), relative_luminance(background)))
    return (hi + 0.05) / (lo + 0.05)
