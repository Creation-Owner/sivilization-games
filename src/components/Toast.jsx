export default function Toast({ toast, onClose }) {
  if (!toast) return null;

  const type = ["success", "error", "info"].includes(toast.type)
    ? toast.type
    : "info";

  return (
    <div className={`toast-message ${type}`} role="status" aria-live="polite">
      <span className="toast-icon" aria-hidden="true">
        {type === "success" ? "✓" : type === "error" ? "!" : "i"}
      </span>
      <p>{toast.message}</p>
      <button type="button" onClick={onClose} aria-label="Close notification">
        ×
      </button>
    </div>
  );
}