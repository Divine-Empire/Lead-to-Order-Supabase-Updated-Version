import { useState, useCallback } from "react";
import ModalAlert from "./ModalAlert";

/**
 * Replacement for the synchronous window.confirm(). Two styles:
 *
 *   const { askConfirm, confirmAsync, confirmDialog } = useConfirmDialog();
 *
 *   // 1) callback style -- for "confirm, then do X" handlers
 *   askConfirm({ title: "Delete item?", message: "...", confirmText: "Delete" }, () => doDelete());
 *
 *   // 2) promise style -- for handlers that must keep running after the answer
 *   //    (resolves true on Confirm, false on Cancel / Esc)
 *   const ok = await confirmAsync({ title: "...", message: "..." });
 *
 *   return (<>{...}{confirmDialog}</>);
 *
 * `destructive` defaults to true (most confirms in the app are deletes);
 * pass `destructive: false` for neutral confirmations.
 */
export default function useConfirmDialog() {
  const [pending, setPending] = useState(null);

  const askConfirm = useCallback((options, onConfirm) => {
    setPending({ ...options, onConfirm });
  }, []);

  const confirmAsync = useCallback(
    (options) =>
      new Promise((resolve) => {
        setPending({ ...options, resolve });
      }),
    []
  );

  const confirmDialog = (
    <ModalAlert
      isOpen={!!pending}
      type="confirm"
      title={pending?.title || "Are you sure?"}
      message={pending?.message || ""}
      confirmText={pending?.confirmText || "Confirm"}
      destructive={pending?.destructive ?? true}
      onConfirm={() => {
        pending?.onConfirm?.();
        pending?.resolve?.(true);
      }}
      onClose={() => {
        // ModalAlert calls onConfirm then onClose; a promise already resolved
        // with true ignores this second resolve(false).
        pending?.resolve?.(false);
        setPending(null);
      }}
    />
  );

  return { askConfirm, confirmAsync, confirmDialog };
}
