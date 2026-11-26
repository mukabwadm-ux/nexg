import type { Settings, WorkspaceData } from './model';

export function settingsObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function personalAppearance(settings: Settings) {
  const value = settingsObject(settings.theme);
  const theme = value.theme === 'light' || value.theme === 'dark' ||
    value.theme === 'contrast' || value.theme === 'custom' ? value.theme : 'nexg';
  return {
    theme,
    accent: typeof value.accent === 'string' && /^#[0-9a-f]{6}$/i.test(value.accent) ? value.accent : null,
    sidebar: value.sidebar === 'light' ? 'light' : 'dark',
    density: value.density === 'compact' ? 'compact' : 'comfortable',
    font_size: value.font_size === 'large' ? 'large' : 'default',
  } as const;
}

export function workspaceReminders(
  data: WorkspaceData,
  units: WorkspaceData['units'],
  stays: WorkspaceData['stays'],
  today: string,
) {
  const preferences = settingsObject(data.settings.notifications);
  const arrivals = stays.filter(stay =>
    stay.start === today && !['Cancelled', 'Draft', 'Completed'].includes(stay.status));
  const departures = stays.filter(stay =>
    stay.end === today && !['Cancelled', 'Draft'].includes(stay.status));
  const unitIds = new Set(units.map(unit => unit.id));
  const due = data.tasks.filter(task =>
    (unitIds.has(task.unitId) || !task.unitId) && task.due && task.due.slice(0, 10) <= today &&
    !['Done', 'Cancelled'].includes(task.status));
  return {
    arrivals: preferences.bookings !== false ? arrivals : [],
    requests: preferences.tasks !== false ? due : [],
    daily: preferences.daily !== false
      ? `${arrivals.length} arrivals · ${departures.length} departures · ${due.length} requests due`
      : null,
  };
}
