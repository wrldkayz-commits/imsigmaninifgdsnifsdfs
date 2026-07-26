"""Code generator package.

Importing this package discovers every generator subpackage and registers the
roadmap entries the export menu shows as "planned". Nothing here knows about the
frontend, and the frontend knows nothing about any individual framework — the
two meet only at `/api/generators`, which serves this registry as data.
"""

from pathlib import Path

from .base import CodeGenerator, GeneratedFile, GenerationResult, GeneratorInfo, registry

# Discover the built-in generators (and any plugin dropped into this directory).
registry.discover(Path(__file__).parent)

# Frameworks on the roadmap. Listing them here — rather than in the UI — is what
# lets a future generator light up without a single frontend change: implement
# the module, delete the line below, done.
for _planned in [
    GeneratorInfo("imgui_docking_cpp", "Dear ImGui + Docking", "cpp", "C++", ".cpp",
                  "Multi-viewport docking layouts.", "planned", "cpp"),
    GeneratorInfo("qt_widgets_cpp", "Qt Widgets", "cpp", "C++", ".cpp",
                  "Native Qt 6 C++ widgets.", "planned", "cpp"),
    GeneratorInfo("qt_quick", "Qt Quick", "qml", "QML", ".qml",
                  "Declarative QML interfaces.", "planned", "javascript"),
    GeneratorInfo("wxwidgets", "wxWidgets", "cpp", "C++", ".cpp",
                  "Cross-platform native C++ toolkit.", "planned", "cpp"),
    GeneratorInfo("fltk", "FLTK", "cpp", "C++", ".cxx",
                  "Lightweight C++ GUI toolkit.", "planned", "cpp"),
    GeneratorInfo("avalonia", "Avalonia", "csharp", "C#", ".axaml",
                  "Cross-platform .NET XAML UI.", "planned", "xml"),
    GeneratorInfo("winforms", ".NET WinForms", "csharp", "C#", ".cs",
                  "Classic Windows Forms designer output.", "planned", "csharp"),
    GeneratorInfo("wpf", "WPF", "csharp", "C#", ".xaml",
                  "Windows Presentation Foundation XAML.", "planned", "xml"),
    GeneratorInfo("gtk", "GTK 4", "python", "Python", ".py",
                  "GTK 4 via PyGObject.", "planned", "python"),
    GeneratorInfo("tauri", "Tauri", "typescript", "TypeScript", ".tsx",
                  "Rust-backed web frontend shell.", "planned", "typescript"),
    GeneratorInfo("electron", "Electron", "typescript", "TypeScript", ".tsx",
                  "Chromium desktop shell.", "planned", "typescript"),
    GeneratorInfo("javafx", "JavaFX", "java", "Java", ".java",
                  "JavaFX scene graph.", "planned", "java"),
    GeneratorInfo("flutter", "Flutter Desktop", "dart", "Dart", ".dart",
                  "Flutter desktop widget tree.", "planned", "dart"),
]:
    registry.register_planned(_planned)

__all__ = [
    "CodeGenerator",
    "GeneratedFile",
    "GenerationResult",
    "GeneratorInfo",
    "registry",
]
