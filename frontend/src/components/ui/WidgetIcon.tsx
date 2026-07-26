/**
 * Resolves an icon name from the backend catalog to a Lucide component.
 *
 * The catalog stores icons as plain strings so the backend never depends on a
 * frontend icon set. Unknown names — say, from a plugin shipping its own icon
 * vocabulary — fall back to a neutral square rather than crashing the palette.
 */

import { memo } from 'react';
import {
  AlignLeft,
  AppWindow,
  Box,
  Calendar,
  CheckSquare,
  ChevronDown,
  Circle,
  CircleDot,
  Columns2,
  FileText,
  Folder,
  Globe,
  Group,
  Hash,
  Image,
  KeyRound,
  LayoutPanelLeft,
  ListTree,
  Loader,
  LoaderCircle,
  Menu,
  Minus,
  MousePointerClick,
  PanelBottom,
  PanelLeft,
  PenTool,
  Scroll,
  SlidersHorizontal,
  Square,
  Star,
  Table,
  Tag,
  ToggleLeft,
  Type,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  'align-left': AlignLeft,
  'app-window': AppWindow,
  box: Box,
  calendar: Calendar,
  'check-square': CheckSquare,
  'chevron-down': ChevronDown,
  circle: Circle,
  'circle-dot': CircleDot,
  columns: Columns2,
  'file-text': FileText,
  folder: Folder,
  globe: Globe,
  group: Group,
  hash: Hash,
  image: Image,
  'key-round': KeyRound,
  'layout-panel-left': LayoutPanelLeft,
  'list-tree': ListTree,
  loader: Loader,
  'loader-circle': LoaderCircle,
  menu: Menu,
  minus: Minus,
  'mouse-pointer-click': MousePointerClick,
  palette: Circle,
  'panel-bottom': PanelBottom,
  'panel-left': PanelLeft,
  'pen-tool': PenTool,
  scroll: Scroll,
  'sliders-horizontal': SlidersHorizontal,
  square: Square,
  star: Star,
  table: Table,
  tag: Tag,
  'toggle-left': ToggleLeft,
  type: Type,
  wrench: Wrench,
};

interface WidgetIconProps {
  name: string;
  size?: number;
  className?: string;
}

export const WidgetIcon = memo(function WidgetIcon({
  name,
  size = 14,
  className,
}: WidgetIconProps) {
  const Icon = ICONS[name] ?? Square;
  return <Icon size={size} className={className} aria-hidden />;
});
