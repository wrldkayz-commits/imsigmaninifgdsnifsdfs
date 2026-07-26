"""Starter templates.

Templates are built with a tiny declarative helper rather than stored as raw
JSON blobs: the helper fills in catalog defaults, so a template only states what
makes it distinctive. That keeps this file readable and means templates stay
valid when the catalog gains new default properties.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import count

from models.catalog import get_spec
from models.schema import (
    Appearance,
    Font,
    Layout,
    Point,
    Project,
    ProjectMeta,
    Size,
    ThemeSpec,
    Widget,
    WindowSpec,
)

_ids = count(1)


def w(type_: str, x: float, y: float, width: float | None = None,
      height: float | None = None, *, text: str = "", name: str = "",
      children: list[Widget] | None = None, events: dict[str, str] | None = None,
      color: str | None = None, background: str | None = None,
      font_size: int | None = None, bold: bool = False, radius: float = 0,
      **props) -> Widget:
    """Create a widget, inheriting defaults from its catalog spec."""
    spec = get_spec(type_)
    default_w, default_h = spec.default_size if spec else (120, 32)
    merged = dict(spec.default_props() if spec else {})
    merged.update(props)

    appearance = Appearance(radius=radius)
    if color:
        appearance.color = color
    if background:
        appearance.background = background
    if font_size or bold:
        appearance.font = Font(size=font_size or 12,
                               weight="bold" if bold else "normal")

    return Widget(
        id=f"{type_.lower()}_{next(_ids)}",
        type=type_,
        name=name or text or type_,
        text=text if text else (spec.default_text if spec else ""),
        layout=Layout(
            position=Point(x=x, y=y),
            size=Size(width=width if width is not None else default_w,
                      height=height if height is not None else default_h),
        ),
        appearance=appearance,
        props=merged,
        events=events or {},
        children=children or [],
    )


def _project(name: str, title: str, width: int, height: int,
             children: list[Widget], *, mode: str = "light",
             description: str = "") -> Project:
    return Project(
        project=ProjectMeta(name=name, description=description),
        window=WindowSpec(title=title, width=width, height=height,
                          background="#0f1117" if mode == "dark" else "#f5f6f8"),
        theme=ThemeSpec(name=f"{name} Theme", mode=mode),  # type: ignore[arg-type]
        widgets=[Widget(id="window_root", type="window", name="MainWindow", text=title,
                        layout=Layout(size=Size(width=width, height=height)),
                        children=children)],
    )


@dataclass(frozen=True, slots=True)
class TemplateInfo:
    id: str
    name: str
    description: str
    category: str


# --- template builders ---------------------------------------------------------


def _login() -> Project:
    return _project("Login Screen", "Sign In", 420, 520, [
        w("panel", 40, 40, 340, 440, name="Card", background="#ffffff", radius=12, children=[
            w("label", 30, 32, 280, 34, text="Welcome back", bold=True, font_size=20),
            w("label", 30, 70, 280, 22, text="Sign in to continue", color="#6b7280"),
            w("label", 30, 120, 280, 20, text="Email"),
            w("textbox", 30, 144, 280, 38, name="EmailInput", placeholder="you@example.com"),
            w("label", 30, 196, 280, 20, text="Password"),
            w("passwordBox", 30, 220, 280, 38, name="PasswordInput", placeholder="••••••••"),
            w("checkbox", 30, 272, 160, 26, text="Remember me", name="RememberMe"),
            w("button", 30, 316, 280, 42, text="Sign In", name="SignInButton",
              background="#3b82f6", color="#ffffff", radius=8,
              events={"click": "on_sign_in"}),
            w("button", 30, 366, 280, 38, text="Create account", name="RegisterButton",
              variant="ghost", events={"click": "on_register"}),
            w("label", 30, 412, 280, 20, text="Forgot your password?", color="#6b7280",
              align="center"),
        ]),
    ], description="A centred sign-in card with email, password and actions.")


def _dashboard() -> Project:
    cards = [
        w("panel", 24 + index * 236, 76, 220, 100, name=f"Stat{index + 1}",
          background="#ffffff", radius=10, children=[
              w("label", 16, 14, 180, 20, text=label, color="#6b7280"),
              w("label", 16, 40, 180, 34, text=value, bold=True, font_size=22),
              w("label", 16, 74, 180, 18, text=delta, color="#16a34a"),
          ])
        for index, (label, value, delta) in enumerate([
            ("Revenue", "$48,210", "+12.4%"),
            ("Active Users", "8,942", "+3.1%"),
            ("Conversion", "4.7%", "+0.6%"),
            ("Churn", "1.2%", "-0.3%"),
        ])
    ]
    return _project("Dashboard", "Analytics Dashboard", 1000, 640, [
        w("menuBar", 0, 0, 1000, 28, items=["File", "View", "Reports", "Help"]),
        w("label", 24, 38, 300, 30, text="Overview", bold=True, font_size=18),
        *cards,
        w("panel", 24, 196, 640, 300, name="ChartPanel", background="#ffffff", radius=10,
          children=[
              w("label", 16, 14, 300, 24, text="Revenue over time", bold=True),
              w("canvas", 16, 48, 608, 236, name="RevenueChart", background="#f8fafc"),
          ]),
        w("panel", 684, 196, 292, 300, name="ActivityPanel", background="#ffffff",
          radius=10, children=[
              w("label", 16, 14, 260, 24, text="Recent activity", bold=True),
              w("table", 16, 48, 260, 236, name="ActivityTable",
                columns=["Time", "Event"], rows=8),
          ]),
        w("progressBar", 24, 516, 952, 12, name="SyncProgress", value=68),
        w("statusBar", 0, 614, 1000, 26, text="Last synced 2 minutes ago"),
    ], description="KPI cards, a chart panel and an activity feed.")


def _admin_panel() -> Project:
    return _project("Admin Panel", "Administration", 1100, 680, [
        w("menuBar", 0, 0, 1100, 28, items=["File", "Users", "System", "Help"]),
        w("sidebar", 0, 28, 210, 626, name="NavSidebar", background="#1f2937",
          items=["Dashboard", "Users", "Roles", "Audit Log", "Settings"]),
        w("toolbar", 210, 28, 890, 44, name="ActionBar", children=[
            w("button", 12, 6, 110, 32, text="Add User", name="AddUserButton",
              events={"click": "on_add_user"}),
            w("button", 130, 6, 110, 32, text="Import", name="ImportButton"),
            w("textbox", 640, 6, 230, 32, name="SearchInput", placeholder="Search users..."),
        ]),
        w("table", 226, 92, 858, 480, name="UsersTable",
          columns=["ID", "Name", "Email", "Role", "Status"], rows=12,
          events={"doubleClick": "on_user_activated"}),
        w("statusBar", 210, 654, 890, 26, text="248 users"),
    ], description="Sidebar navigation with a user management table.")


def _settings() -> Project:
    return _project("Settings Window", "Preferences", 640, 520, [
        w("tabs", 16, 16, 608, 440, name="SettingsTabs",
          items=["General", "Appearance", "Advanced"], children=[
              w("frame", 0, 0, 608, 400, name="GeneralPage", children=[
                  w("label", 24, 24, 200, 24, text="Startup", bold=True),
                  w("checkbox", 24, 56, 300, 26, text="Launch at login",
                    name="LaunchAtLogin"),
                  w("checkbox", 24, 88, 300, 26, text="Restore last session",
                    name="RestoreSession", checked=True),
                  w("label", 24, 132, 200, 24, text="Updates", bold=True),
                  w("comboBox", 24, 164, 240, 32, name="UpdateChannel",
                    items=["Stable", "Beta", "Nightly"]),
              ]),
              w("frame", 0, 0, 608, 400, name="AppearancePage", children=[
                  w("label", 24, 24, 200, 24, text="Theme", bold=True),
                  w("radioButton", 24, 56, 200, 26, text="Light", group="theme",
                    checked=True, value="light"),
                  w("radioButton", 24, 88, 200, 26, text="Dark", group="theme",
                    value="dark"),
                  w("radioButton", 24, 120, 200, 26, text="Follow system",
                    group="theme", value="system"),
                  w("label", 24, 164, 200, 24, text="Accent colour"),
                  w("colorPicker", 24, 192, 160, 32, name="AccentColor"),
                  w("label", 24, 240, 200, 24, text="Font size"),
                  w("slider", 24, 268, 260, 28, name="FontSize", min=10, max=24, value=14),
              ]),
              w("frame", 0, 0, 608, 400, name="AdvancedPage", children=[
                  w("label", 24, 24, 300, 24, text="Diagnostics", bold=True),
                  w("checkbox", 24, 56, 320, 26, text="Send anonymous usage data",
                    name="Telemetry"),
                  w("label", 24, 100, 300, 24, text="Cache directory"),
                  w("textbox", 24, 128, 400, 32, name="CachePath"),
                  w("button", 24, 176, 140, 34, text="Clear Cache",
                    name="ClearCacheButton", events={"click": "on_clear_cache"}),
              ]),
          ]),
        w("button", 424, 470, 90, 34, text="Cancel", name="CancelButton", variant="ghost",
          events={"click": "on_cancel"}),
        w("button", 524, 470, 100, 34, text="Save", name="SaveButton",
          background="#3b82f6", color="#ffffff", events={"click": "on_save"}),
    ], description="Tabbed preferences window with a save/cancel footer.")


def _calculator() -> Project:
    buttons = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-",
               "0", ".", "=", "+"]
    keys = [
        w("button", 16 + (index % 4) * 72, 96 + (index // 4) * 62, 64, 54,
          text=label, name=f"Key{label}", radius=8,
          events={"click": f"on_key_{_key_name(label)}"})
        for index, label in enumerate(buttons)
    ]
    return _project("Calculator", "Calculator", 320, 420, [
        w("textbox", 16, 20, 280, 60, name="Display", value="0", readOnly=True,
          font_size=24),
        *keys,
        w("button", 16, 348, 280, 44, text="Clear", name="ClearButton",
          background="#ef4444", color="#ffffff", events={"click": "on_clear"}),
    ], description="A four-function calculator keypad.")


def _key_name(label: str) -> str:
    return {"/": "divide", "*": "multiply", "-": "minus", "+": "plus",
            "=": "equals", ".": "decimal"}.get(label, f"digit_{label}")


def _music_player() -> Project:
    return _project("Music Player", "Player", 900, 560, [
        w("sidebar", 0, 0, 200, 500, name="LibraryNav", background="#111827",
          items=["Home", "Search", "Your Library", "Playlists"]),
        w("panel", 216, 16, 668, 300, name="NowPlaying", background="#1f2937",
          radius=12, children=[
              w("image", 20, 20, 200, 200, name="AlbumArt"),
              w("label", 240, 32, 400, 32, text="Track Title", bold=True, font_size=20,
                color="#ffffff"),
              w("label", 240, 68, 400, 24, text="Artist Name", color="#9ca3af"),
              w("label", 240, 96, 400, 24, text="Album - 2024", color="#9ca3af"),
              w("progressBar", 240, 200, 400, 6, name="TrackProgress", value=35),
              w("label", 240, 212, 60, 18, text="1:24", color="#9ca3af"),
              w("label", 580, 212, 60, 18, text="3:58", color="#9ca3af", align="right"),
          ]),
        w("table", 216, 332, 668, 168, name="Queue",
          columns=["#", "Title", "Artist", "Length"], rows=6),
        w("panel", 0, 500, 900, 60, name="TransportBar", background="#0b0f19", children=[
            w("iconButton", 360, 12, 36, 36, text="<<", name="PrevButton",
              events={"click": "on_previous"}),
            w("iconButton", 408, 8, 44, 44, text=">", name="PlayButton",
              events={"click": "on_play_pause"}),
            w("iconButton", 464, 12, 36, 36, text=">>", name="NextButton",
              events={"click": "on_next"}),
            w("slider", 720, 20, 150, 24, name="VolumeSlider", value=70),
        ]),
    ], mode="dark", description="Now-playing view with a queue and transport bar.")


def _discord_layout() -> Project:
    return _project("Discord Style Layout", "Chat Workspace", 1100, 680, [
        w("panel", 0, 0, 72, 680, name="ServerRail", background="#1e2124", children=[
            w("iconButton", 16, 16 + index * 56, 40, 40, text=label,
              name=f"Server{index + 1}", radius=20)
            for index, label in enumerate(["A", "B", "C", "+"])
        ]),
        w("panel", 72, 0, 220, 680, name="ChannelList", background="#2f3136", children=[
            w("label", 16, 16, 180, 26, text="My Server", bold=True, color="#ffffff"),
            w("treeView", 8, 52, 204, 560, name="Channels",
              items=["TEXT CHANNELS", "  # general", "  # random", "  # dev",
                     "VOICE CHANNELS", "  Lounge", "  Standup"]),
        ]),
        w("panel", 292, 0, 588, 680, name="ChatArea", background="#36393f", children=[
            w("label", 16, 14, 300, 26, text="# general", bold=True, color="#ffffff"),
            w("separator", 0, 48, 588, 2),
            w("scrollArea", 8, 56, 572, 552, name="MessageList"),
            w("textbox", 16, 620, 556, 44, name="MessageInput",
              placeholder="Message #general", events={"keyPress": "on_message_key"}),
        ]),
        w("panel", 880, 0, 220, 680, name="MemberList", background="#2f3136", children=[
            w("label", 16, 16, 180, 24, text="ONLINE - 3", color="#9ca3af"),
            w("treeView", 8, 48, 204, 600, name="Members",
              items=["Alice", "Bob", "Carol"], showRoot=False),
        ]),
    ], mode="dark", description="Three-column chat workspace with server rail.")


def _chat_app() -> Project:
    return _project("Chat Application", "Messages", 820, 600, [
        w("panel", 0, 0, 260, 600, name="ConversationList", background="#f3f4f6", children=[
            w("textbox", 12, 12, 236, 34, name="SearchConversations",
              placeholder="Search"),
            w("treeView", 8, 56, 244, 536, name="Conversations",
              items=["Alice", "Bob", "Design Team", "Standup"], showRoot=False),
        ]),
        w("panel", 260, 0, 560, 56, name="ChatHeader", background="#ffffff", children=[
            w("label", 16, 16, 300, 26, text="Alice", bold=True),
            w("label", 16, 34, 300, 18, text="Online", color="#16a34a"),
        ]),
        w("scrollArea", 268, 64, 544, 468, name="MessageScroll"),
        w("textbox", 268, 544, 456, 42, name="ComposeInput",
          placeholder="Type a message..."),
        w("button", 732, 544, 80, 42, text="Send", name="SendButton",
          background="#3b82f6", color="#ffffff", events={"click": "on_send"}),
    ], description="Conversation list beside a message thread and composer.")


def _file_explorer() -> Project:
    return _project("File Explorer", "Files", 960, 620, [
        w("menuBar", 0, 0, 960, 28, items=["File", "Edit", "View", "Help"]),
        w("toolbar", 0, 28, 960, 44, name="NavBar", children=[
            w("iconButton", 8, 4, 36, 36, text="<", name="BackButton"),
            w("iconButton", 48, 4, 36, 36, text=">", name="ForwardButton"),
            w("iconButton", 88, 4, 36, 36, text="^", name="UpButton"),
            w("textbox", 132, 6, 620, 32, name="PathInput", value="C:\\Users"),
            w("textbox", 760, 6, 190, 32, name="SearchInput", placeholder="Search"),
        ]),
        w("splitter", 0, 72, 960, 522, name="MainSplit", children=[
            w("treeView", 0, 0, 240, 522, name="FolderTree",
              items=["This PC", "  Desktop", "  Documents", "  Downloads", "  Pictures"]),
            w("table", 0, 0, 716, 522, name="FileList",
              columns=["Name", "Date modified", "Type", "Size"], rows=14,
              events={"doubleClick": "on_file_open"}),
        ]),
        w("statusBar", 0, 594, 960, 26, text="24 items"),
    ], description="Classic two-pane file browser with toolbar and path bar.")


def _ide_layout() -> Project:
    return _project("IDE Layout", "Code Editor", 1200, 720, [
        w("menuBar", 0, 0, 1200, 28,
          items=["File", "Edit", "Selection", "View", "Run", "Help"]),
        w("toolbar", 0, 28, 1200, 36, name="ActionBar", children=[
            w("iconButton", 8, 2, 32, 32, text="R", name="RunButton",
              events={"click": "on_run"}),
            w("iconButton", 44, 2, 32, 32, text="D", name="DebugButton"),
            w("iconButton", 80, 2, 32, 32, text="S", name="StopButton"),
        ]),
        w("panel", 0, 64, 260, 596, name="ExplorerPane", background="#252526", children=[
            w("label", 12, 8, 200, 22, text="EXPLORER", color="#cccccc"),
            w("treeView", 4, 36, 252, 552, name="ProjectTree",
              items=["src", "  main.py", "  utils.py", "tests", "  test_main.py",
                     "README.md"]),
        ]),
        w("tabs", 260, 64, 700, 420, name="EditorTabs", items=["main.py", "utils.py"],
          children=[
              w("frame", 0, 0, 700, 380, name="MainEditor", children=[
                  w("multilineText", 0, 0, 700, 380, name="EditorArea",
                    value="def main():\n    print('Hello, world!')\n"),
              ]),
              w("frame", 0, 0, 700, 380, name="UtilsEditor", children=[
                  w("multilineText", 0, 0, 700, 380, name="UtilsArea"),
              ]),
          ]),
        w("tabs", 260, 492, 700, 168, name="PanelTabs",
          items=["Terminal", "Problems", "Output"], children=[
              w("frame", 0, 0, 700, 130, name="TerminalPage", children=[
                  w("multilineText", 0, 0, 700, 130, name="TerminalOutput",
                    value="$ ", background="#1e1e1e", color="#d4d4d4"),
              ]),
              w("frame", 0, 0, 700, 130, name="ProblemsPage", children=[
                  w("table", 0, 0, 700, 130, name="ProblemsTable",
                    columns=["File", "Line", "Message"], rows=4),
              ]),
              w("frame", 0, 0, 700, 130, name="OutputPage"),
          ]),
        w("panel", 960, 64, 240, 596, name="InspectorPane", background="#252526", children=[
            w("label", 12, 8, 200, 22, text="OUTLINE", color="#cccccc"),
            w("treeView", 4, 36, 232, 552, name="Outline", items=["main()", "helper()"]),
        ]),
        w("statusBar", 0, 690, 1200, 26, text="Python 3.12  |  UTF-8  |  Ln 1, Col 1"),
    ], mode="dark", description="Editor with explorer, tabs, panel and status bar.")


def _game_launcher() -> Project:
    return _project("Game Launcher", "Launcher", 1000, 620, [
        w("panel", 0, 0, 1000, 72, name="HeaderBar", background="#0b0f19", children=[
            w("label", 24, 22, 260, 30, text="GAME LAUNCHER", bold=True, font_size=18,
              color="#ffffff"),
            w("button", 860, 18, 116, 36, text="Account", name="AccountButton",
              variant="outline"),
        ]),
        w("sidebar", 0, 72, 220, 548, name="LibraryNav", background="#111827",
          items=["Store", "Library", "Friends", "Downloads"]),
        w("panel", 236, 88, 748, 300, name="FeaturedPanel", background="#1f2937",
          radius=12, children=[
              w("image", 0, 0, 748, 220, name="FeaturedArt"),
              w("label", 20, 232, 400, 30, text="Featured Title", bold=True,
                font_size=20, color="#ffffff"),
              w("button", 600, 236, 130, 44, text="Play", name="PlayButton",
                background="#22c55e", color="#ffffff", radius=8,
                events={"click": "on_play"}),
          ]),
        w("label", 236, 404, 300, 26, text="Your Library", bold=True, font_size=16),
        w("scrollArea", 236, 436, 748, 168, name="GameGrid", children=[
            w("panel", 8 + index * 148, 8, 136, 140, name=f"GameCard{index + 1}",
              background="#1f2937", radius=8, children=[
                  w("image", 8, 8, 120, 90, name=f"GameArt{index + 1}"),
                  w("label", 8, 104, 120, 20, text=f"Game {index + 1}", color="#ffffff"),
              ])
            for index in range(5)
        ]),
    ], mode="dark", description="Store-style launcher with featured banner and grid.")


def _inventory_system() -> Project:
    return _project("Inventory System", "Inventory", 1000, 640, [
        w("menuBar", 0, 0, 1000, 28, items=["File", "Stock", "Reports", "Help"]),
        w("toolbar", 0, 28, 1000, 44, name="ToolBar", children=[
            w("button", 8, 6, 100, 32, text="New Item", name="NewItemButton",
              events={"click": "on_new_item"}),
            w("button", 116, 6, 100, 32, text="Receive", name="ReceiveButton"),
            w("button", 224, 6, 100, 32, text="Adjust", name="AdjustButton"),
            w("textbox", 700, 6, 240, 32, name="SearchInput", placeholder="Search SKU..."),
        ]),
        w("table", 16, 88, 640, 456, name="InventoryTable",
          columns=["SKU", "Item", "Location", "On Hand", "Reorder"], rows=14,
          events={"change": "on_item_selected"}),
        w("group", 672, 88, 312, 456, name="DetailPanel", text="Item Detail", children=[
            w("label", 16, 40, 120, 22, text="SKU"),
            w("textbox", 16, 64, 280, 32, name="SkuInput"),
            w("label", 16, 106, 120, 22, text="Description"),
            w("multilineText", 16, 130, 280, 80, name="DescriptionInput"),
            w("label", 16, 222, 120, 22, text="Quantity"),
            w("numberInput", 16, 246, 140, 32, name="QuantityInput", max=9999),
            w("label", 16, 288, 120, 22, text="Reorder level"),
            w("numberInput", 16, 312, 140, 32, name="ReorderInput", max=9999),
            w("button", 16, 372, 130, 36, text="Save", name="SaveItemButton",
              background="#3b82f6", color="#ffffff", events={"click": "on_save_item"}),
            w("button", 156, 372, 130, 36, text="Delete", name="DeleteItemButton",
              variant="danger", events={"click": "on_delete_item"}),
        ]),
        w("statusBar", 0, 614, 1000, 26, text="1,284 SKUs  |  12 below reorder level"),
    ], description="Stock table with a detail editor panel.")


def _node_editor() -> Project:
    return _project("Node Editor", "Node Graph", 1100, 700, [
        w("menuBar", 0, 0, 1100, 28, items=["File", "Edit", "Graph", "View"]),
        w("panel", 0, 28, 220, 672, name="NodePalette", background="#1b1e27", children=[
            w("label", 12, 10, 180, 24, text="Nodes", bold=True, color="#ffffff"),
            w("textbox", 12, 40, 196, 30, name="NodeSearch", placeholder="Search nodes"),
            w("treeView", 8, 78, 204, 580, name="NodeTree",
              items=["Input", "  Value", "  Texture", "Math", "  Add", "  Multiply",
                     "Output", "  Render"]),
        ]),
        w("canvas", 220, 28, 660, 672, name="GraphCanvas", background="#0f1117"),
        w("panel", 880, 28, 220, 672, name="NodeInspector", background="#1b1e27",
          children=[
              w("label", 12, 10, 180, 24, text="Properties", bold=True, color="#ffffff"),
              w("label", 12, 44, 180, 20, text="Node name", color="#9ca3af"),
              w("textbox", 12, 66, 196, 30, name="NodeNameInput"),
              w("label", 12, 106, 180, 20, text="Blend", color="#9ca3af"),
              w("slider", 12, 128, 196, 26, name="BlendSlider"),
              w("label", 12, 166, 180, 20, text="Mode", color="#9ca3af"),
              w("comboBox", 12, 188, 196, 30, name="ModeCombo",
                items=["Add", "Subtract", "Multiply", "Screen"]),
              w("colorPicker", 12, 236, 196, 30, name="TintColor"),
              w("checkbox", 12, 280, 196, 26, text="Preview", name="PreviewToggle"),
          ]),
    ], mode="dark", description="Graph canvas with node palette and inspector.")


_BUILDERS = {
    "login": ("Login Screen", "Authentication", _login),
    "dashboard": ("Dashboard", "Analytics", _dashboard),
    "admin-panel": ("Admin Panel", "Business", _admin_panel),
    "settings": ("Settings Window", "Utility", _settings),
    "calculator": ("Calculator", "Utility", _calculator),
    "music-player": ("Music Player", "Media", _music_player),
    "discord-layout": ("Discord Style Layout", "Communication", _discord_layout),
    "chat-app": ("Chat Application", "Communication", _chat_app),
    "file-explorer": ("File Explorer", "Utility", _file_explorer),
    "ide-layout": ("IDE Layout", "Developer", _ide_layout),
    "game-launcher": ("Game Launcher", "Media", _game_launcher),
    "inventory-system": ("Inventory System", "Business", _inventory_system),
    "node-editor": ("Node Editor", "Developer", _node_editor),
}


def list_templates() -> list[TemplateInfo]:
    return [
        TemplateInfo(id=key, name=name, category=category,
                     description=builder.__doc__ or _describe(builder))
        for key, (name, category, builder) in _BUILDERS.items()
    ]


def _describe(builder) -> str:
    # The description lives on the Project the builder produces, which keeps the
    # text next to the layout it describes.
    return builder().project.description


def get_template(template_id: str) -> Project:
    entry = _BUILDERS.get(template_id)
    if entry is None:
        raise KeyError(f"Unknown template '{template_id}'")
    return entry[2]()
