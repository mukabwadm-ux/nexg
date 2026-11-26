export const pageItems = <T,>(items: T[], page: number, size: number) =>
  items.slice((page - 1) * size, page * size);
export const maxPage = (total: number, size: number) => Math.max(1, Math.ceil(total / size));
export const text = (value: string | null) =>
  value ? value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()) : '—';
export function stamp(value: string | null, timeZone: string) {
  return value
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone,
      }).format(new Date(value))
    : '—';
}
