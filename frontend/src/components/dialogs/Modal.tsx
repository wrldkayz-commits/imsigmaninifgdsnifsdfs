/**
 * Shared modal shell.
 *
 * Handles the parts that are easy to get subtly wrong: escape-to-close,
 * backdrop dismissal that ignores drags that started inside, and focus moving
 * into the dialog on open.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'max-w-2xl',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const pressedInside = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    requestAnimationFrame(() => panelRef.current?.focus());
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={(event) => {
            pressedInside.current = event.target !== event.currentTarget;
          }}
          onMouseUp={(event) => {
            // Only dismiss when both press and release happened on the backdrop,
            // so a text selection that ends outside does not close the dialog.
            if (!pressedInside.current && event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`flex max-h-[85vh] w-full ${width} flex-col overflow-hidden rounded-xl border border-edge bg-surface shadow-float outline-none`}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <header className="flex shrink-0 items-start gap-3 border-b border-edge px-4 py-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-ink">{title}</h2>
                {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded p-1 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
              >
                <X size={15} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

            {footer && (
              <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-edge px-4 py-3">
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      {...props}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-sunken disabled:opacity-40"
      {...props}
    >
      {children}
    </button>
  );
}
