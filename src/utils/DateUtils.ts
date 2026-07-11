// Builds an epoch (ms) from already-split local date/time components.
// Centralizes the `new Date(...).getTime()` construction used by parsers
// that hand-split delimited timestamps (e.g. "yy/MM/dd HH:mm:ss").
export function localDateTimeToEpoch(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms = 0,
): number {
  return new Date(year, month - 1, day, hour, minute, second, ms).getTime();
}
