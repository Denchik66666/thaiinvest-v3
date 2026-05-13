/** Локальный YYYY-MM-DD из ISO даты входа (как в деск-модалках пополнения). */
export function investorEntryToYmd(entry?: string | null): string {
  if (!entry) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const d = new Date(entry);
  if (Number.isNaN(d.getTime())) {
    const d2 = new Date();
    return `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, "0")}-${String(d2.getDate()).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
