export function formatCurrency(amount: number, currency: string = "SAR") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPercent(percent: number) {
  return `${percent}%`;
}
