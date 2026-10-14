import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared modal behaviour: Esc closes, Tab stays inside the dialog, focus moves in on open
 * and returns to the previously focused element on close.
 *
 * Attach the returned ref to the dialog container.
 * `autoFocus: false` leaves initial focus to the caller (e.g. ModalForm focuses the first field).
 */
// Open dialogs, oldest first. Only the topmost one reacts to Esc / Tab, so a
// confirm dialog stacked over a form dialog doesn't close or trap both.
const openDialogs = [];

export default function useDialogBehavior(onClose, { autoFocus = true } = {}) {
  const containerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const container = containerRef.current;

    if (autoFocus && container) {
      const first = container.querySelector(FOCUSABLE);
      (first || container).focus?.();
    }

    const token = {};
    openDialogs.push(token);

    const onKeyDown = (e) => {
      if (openDialogs[openDialogs.length - 1] !== token) return;
      if (e.key === 'Escape') {
        // A control inside the dialog (e.g. an open dropdown) already used this Esc.
        if (e.defaultPrevented) return;
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !container) return;
      const items = Array.from(container.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const at = openDialogs.indexOf(token);
      if (at !== -1) openDialogs.splice(at, 1);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, [autoFocus]);

  return containerRef;
}
