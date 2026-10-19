type DeliveryCity = {
  id: string;
  name: string;
  status: string;
};

type DeliveryZone = {
  id: string;
  city_id: string;
  name: string;
};

export function DeliveryZones({
  cities,
  zones,
}: {
  cities: DeliveryCity[];
  zones: DeliveryZone[];
}) {
  const groups = cities
    .map((city) => ({
      ...city,
      zones: zones.filter((zone) => zone.city_id === city.id),
    }))
    .filter((city) => city.zones.length > 0);
  const zoneCount = groups.reduce((total, city) => total + city.zones.length, 0);

  return (
    <div>
      <div className="max-w-2xl">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
          Zones where we deliver
        </h2>
        <p className="text-muted mt-2 text-[0.9375rem] font-semibold leading-[1.7]">
          We currently cover {zoneCount} neighbourhood zones across {groups.length}{' '}
          {groups.length === 1 ? 'city' : 'cities'}. Coverage is organized by local delivery area.
        </p>
      </div>

      <ul className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((city) => (
          <li key={city.id} className="border-border bg-surface rounded-2xl border p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-ink text-lg font-extrabold">{city.name}</h3>
              {city.status === 'soft_launch' && (
                <span className="text-warning text-[0.625rem] font-bold uppercase tracking-wide">
                  Soft launch
                </span>
              )}
            </div>
            <ul aria-label={`${city.name} delivery zones`} className="mt-4 flex flex-wrap gap-2">
              {city.zones.map((zone) => (
                <li
                  key={zone.id}
                  className="border-border-strong bg-bg text-muted rounded-full border px-3 py-1.5 text-xs font-semibold"
                >
                  {zone.name}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
