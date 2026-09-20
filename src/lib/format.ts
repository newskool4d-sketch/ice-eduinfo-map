/**
 * Locale-aware number formatters shared by the indicator registry and the
 * dashboard UI. Pure functions, no React import — safe to use from Node
 * pipeline scripts as well as client components.
 */

const intFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

/** ko-KR thousands-separated integer, e.g. 70524 -> "70,524". Rounds non-integers. */
export function formatInt(value: number): string {
  return intFormatter.format(value);
}

const decimalFormatterCache = new Map<number, Intl.NumberFormat>();
function decimalFormatter(digits: number): Intl.NumberFormat {
  let formatter = decimalFormatterCache.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("ko-KR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    decimalFormatterCache.set(digits, formatter);
  }
  return formatter;
}

/** ko-KR thousands-separated decimal with a fixed number of fraction digits. */
export function formatDecimal(value: number, digits: number): string {
  return decimalFormatter(digits).format(value);
}

/**
 * Formats a percentage value that is already expressed on a 0-100 scale
 * (as produced by the `share` aggregate: count / total * 100) — this does
 * NOT multiply by 100 again. Defaults to 1 fraction digit.
 */
export function formatPercent(value: number, digits = 1): string {
  return `${decimalFormatter(digits).format(value)}%`;
}

/** Square-meter area, ko-KR thousands separators, rounded to the nearest ㎡. */
export function formatArea(value: number): string {
  return `${formatInt(value)}㎡`;
}
