/**
 * The MIME type used to move a widget type from the library to the canvas.
 *
 * A custom type (rather than `text/plain`) means the canvas can distinguish a
 * library drag from an arbitrary text or file drop, and reject the latter.
 */
export const LIBRARY_DRAG_TYPE = 'application/x-guiforge-widget';
