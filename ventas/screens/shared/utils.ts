export function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function getFirstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
