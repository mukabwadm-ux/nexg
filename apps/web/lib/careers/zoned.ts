/**
 * "2026-12-14T10:30", as typed into a datetime-local field, read as clock
 * time in `timeZone`, as an instant. The interview is at half past ten in
 * Nairobi wherever the person typing it happens to be.
 */
export function zonedToInstant(local: string, timeZone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const asUtc = new Date(`${local}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  const there = new Date(asUtc.toLocaleString('en-US', { timeZone }));
  const utc = new Date(asUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(asUtc.getTime() - (there.getTime() - utc.getTime())).toISOString();
}
