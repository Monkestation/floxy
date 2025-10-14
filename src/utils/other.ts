export function getFilenameFriendlyUTCDate(date: Date = new Date()): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}_UTC`;
}

/**
 *  For use in array filters
 * @param value Filter value
 * @returns {TValue} false if value is null or defined;
 */
export function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}