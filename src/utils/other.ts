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

export function BooleanLike(val: string | undefined): boolean {
  if (typeof val === "string") {
    if (!Number.isNaN(parseInt(val, 10))) {
      return Boolean(parseInt(val, 10));
    } else {
      // what the fuck am i doing
      return /^true|false|y(?:es)?|no?|1|0/i.test(val);
    }
  } else {
    return Boolean(val);
  }
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Converts a Unix timestamp (milliseconds) or a Date object to a BYOND timestamp (deciseconds).
 * The BYOND epoch is 00:00:00 GMT, January 1, 2000.
 *
 */
// function toByondTimestamp(date: Date | number) {
//   const BYOND_EPOCH_MS = Date.UTC(2000, 0, 1); // Date.UTC(year, monthIndex, day)

//   let inputTimeMS: number;

//   if (date instanceof Date) {
//     inputTimeMS = date.getTime();
//   } else if (typeof date === "number") {
//     inputTimeMS = date;
//   } else {
//     throw new Error("Invalid input: must be a Unix timestamp (number) or a Date object.");
//   }

//   const timeDifferenceMS = inputTimeMS - BYOND_EPOCH_MS;

//   const byondTimestampDS = timeDifferenceMS / 100;

//   return Math.floor(byondTimestampDS);
// }

