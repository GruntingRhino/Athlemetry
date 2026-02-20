export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function formatSeconds(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "-";
  }

  return `${value.toFixed(2)}s`;
}
