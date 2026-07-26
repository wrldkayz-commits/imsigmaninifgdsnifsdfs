/**
 * Catalog and generator descriptors served by the backend.
 *
 * Nothing in the frontend hard-codes a widget type or a framework: the library
 * palette, the property inspector, the canvas renderer and the export menu are
 * all built from these structures at runtime. Adding a widget type or a code
 * generator on the backend makes it appear here with no frontend change.
 */

import type { EventName } from './project';

export type WidgetCategory =
  | 'Containers'
  | 'Inputs'
  | 'Buttons'
  | 'Display'
  | 'Navigation'
  | 'Media'
  | 'Advanced'
  | 'Custom';

export type PropType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'color'
  | 'stringList'
  | 'font'
  | 'image';

export interface PropDef {
  key: string;
  label: string;
  type: PropType;
  default: unknown;
  options: string[];
  min: number | null;
  max: number | null;
  step: number | null;
  group: string;
  help: string;
}

export interface WidgetSpec {
  type: string;
  label: string;
  category: WidgetCategory;
  icon: string;
  description: string;
  keywords: string[];

  container: boolean;
  accepts: string[] | null;
  maxChildren: number | null;
  rootOnly: boolean;
  resizable: boolean;

  defaultSize: [number, number];
  defaultText: string;
  props: PropDef[];
  events: EventName[];
}

export interface CatalogResponse {
  schemaVersion: number;
  widgets: WidgetSpec[];
}

export interface GeneratorDescriptor {
  id: string;
  label: string;
  language: string;
  languageLabel: string;
  extension: string;
  description: string;
  status: 'stable' | 'beta' | 'planned';
  monacoLanguage: string;
  features: string[];
  available: boolean;
}

export interface TemplateDescriptor {
  id: string;
  name: string;
  description: string;
  category: string;
}

// --- generation & validation ---------------------------------------------------

export interface GeneratedFile {
  path: string;
  content: string;
  language: string;
  lineCount: number;
}

export interface Diagnostic {
  level: 'info' | 'warning' | 'error';
  message: string;
  widgetId: string | null;
}

export interface GenerateResponse {
  generator: string;
  files: GeneratedFile[];
  diagnostics: Diagnostic[];
  durationMs: number;
}

export interface ValidationIssue {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  widgetId: string | null;
  widgetName: string | null;
}

export interface ProjectStatistics {
  widgetCount: number;
  containerCount: number;
  maxDepth: number;
  eventCount: number;
  uniqueHandlers: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface ValidateResponse {
  issues: ValidationIssue[];
  accessibility: ValidationIssue[];
  statistics: ProjectStatistics;
}

export type ExportFormat = 'zip' | 'source' | 'json' | 'theme';
