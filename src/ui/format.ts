export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
export const formatTime = (value: number) =>
  `${Math.floor(Math.max(value, 0) / 60)}h ${String(Math.round(Math.max(value, 0) % 60)).padStart(2, "0")}m`;
