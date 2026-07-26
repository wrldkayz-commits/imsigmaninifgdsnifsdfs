"""Plugin loader.

A plugin is any Python package dropped into this directory that exposes a
`register(context)` function. It can contribute widgets, generators, exporters,
templates and themes without a single core file being edited — and because the
frontend renders the widget library, inspector and export menu from whatever the
API reports, a plugin's contributions appear in the UI automatically.

Minimal plugin
--------------
    # plugins/my_plugin/__init__.py
    from models.catalog import Category, PropDef, PropType, WidgetSpec

    def register(context):
        context.add_widget(WidgetSpec(
            type="gauge", label="Gauge", category=Category.DISPLAY,
            default_size=(120, 120),
            props=[PropDef(key="value", label="Value", type=PropType.NUMBER, default=50)],
        ))
        context.add_generator(MyFrameworkGenerator)

A plugin that raises during registration is skipped with a logged message; one
bad plugin must never stop the application from starting.
"""

from __future__ import annotations

import importlib
import pkgutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from generators.base import CodeGenerator, registry
from models.catalog import WidgetSpec, register_spec
from models.schema import Project, ThemeSpec


@dataclass(slots=True)
class PluginContext:
    """The extension surface handed to each plugin's `register()`.

    Plugins talk to this object rather than importing core internals, so the
    core is free to change as long as this contract holds.
    """

    plugin_id: str
    templates: dict[str, Callable[[], Project]] = field(default_factory=dict)
    themes: dict[str, ThemeSpec] = field(default_factory=dict)
    exporters: dict[str, Callable] = field(default_factory=dict)
    property_editors: dict[str, str] = field(default_factory=dict)

    def add_widget(self, spec: WidgetSpec, *, replace: bool = False) -> None:
        register_spec(spec, replace=replace)

    def add_generator(self, generator_class: type[CodeGenerator]) -> None:
        registry.register(generator_class)

    def add_template(self, template_id: str, builder: Callable[[], Project]) -> None:
        self.templates[f"{self.plugin_id}:{template_id}"] = builder

    def add_theme(self, theme_id: str, theme: ThemeSpec) -> None:
        self.themes[f"{self.plugin_id}:{theme_id}"] = theme

    def add_exporter(self, format_id: str, handler: Callable) -> None:
        self.exporters[format_id] = handler

    def add_property_editor(self, prop_type: str, component_name: str) -> None:
        """Map a custom `PropType` onto a frontend component name.

        The frontend resolves unknown editor types through this table, so a
        plugin can ship its own inspector control.
        """
        self.property_editors[prop_type] = component_name


@dataclass(slots=True)
class LoadedPlugin:
    id: str
    module: object
    context: PluginContext


_loaded: list[LoadedPlugin] = []


def load_plugins(directory: Path | None = None) -> list[LoadedPlugin]:
    """Import and register every plugin package in `directory`."""
    directory = directory or Path(__file__).parent
    _loaded.clear()

    for module_info in pkgutil.iter_modules([str(directory)]):
        if not module_info.ispkg:
            continue
        plugin_id = module_info.name
        try:
            module = importlib.import_module(f"plugins.{plugin_id}")
            register = getattr(module, "register", None)
            if register is None:
                print(f"[GUIForge] Plugin '{plugin_id}' has no register(); skipped.")
                continue
            context = PluginContext(plugin_id=plugin_id)
            register(context)
            _loaded.append(LoadedPlugin(plugin_id, module, context))
            print(f"[GUIForge] Loaded plugin '{plugin_id}'.")
        except Exception as exc:
            print(f"[GUIForge] Plugin '{plugin_id}' failed to load: {exc}")

    return list(_loaded)


def loaded_plugins() -> list[LoadedPlugin]:
    return list(_loaded)
