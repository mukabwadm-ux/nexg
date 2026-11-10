import { useWorkspace } from './workspace';
import { Icon } from './ui';

const primarySections = [
  { label: 'Overview', slug: 'overview', icon: 'building' },
  { label: 'Reservations', slug: 'reservations', icon: 'calendar' },
  { label: 'Guest guide', slug: 'guest-guide', icon: 'book' },
  { label: 'Access', slug: 'access', icon: 'settings' },
  { label: 'QR cards', slug: 'qr-cards', icon: 'qr' },
];
const extraSections = [
  { label: 'Unit details', slug: 'details' },
  { label: 'Availability', slug: 'availability' },
  { label: 'Tasks & requests', slug: 'tasks' },
  { label: 'Packages', slug: 'packages' },
  { label: 'Deliveries', slug: 'deliveries' },
  { label: 'Finances', slug: 'finances' },
  { label: 'Messages', slug: 'messages' },
  { label: 'History', slug: 'history' },
];

export function propertySectionLabel(slug: string) {
  return (
    [...primarySections, ...extraSections].find((item) => item.slug === slug)?.label ||
    'Guest guide'
  );
}
export function propertySectionSlug(label: string) {
  return (
    [...primarySections, ...extraSections].find((item) => item.label === label)?.slug ||
    'guest-guide'
  );
}

/** One navigation surface for the existing portfolio and unit screens. */
export function PropertiesNavigation({
  value = 'overview',
  propertyId,
  unitId,
}: {
  value?: string;
  propertyId?: string;
  unitId?: string;
}) {
  const w = useWorkspace();
  const units = propertyId
    ? w.data.units.filter((unit) => unit.propertyId === propertyId)
    : w.units;
  const currentUnit = w.data.units.find((unit) => unit.id === unitId) || units[0];
  const navigate = (section: string) => {
    if (section === 'overview') {
      w.go('properties', '', 'overview');
      return;
    }
    if (section === 'reservations' && !unitId) {
      w.go(propertyId ? 'property' : 'properties', propertyId || '', section);
      return;
    }
    if (currentUnit) {
      w.go('unit', currentUnit.id, section);
      return;
    }
    w.notify('Add a unit to open this section.');
    if (propertyId) w.edit('units', undefined, { propertyId });
  };
  return (
    <nav className="unit-navigation properties-navigation" aria-label="Properties sections">
      <div className="properties-section-links">
        {primarySections.map((item) => (
          <button
            key={item.slug}
            className={value === item.slug ? 'active' : ''}
            aria-current={value === item.slug ? 'page' : undefined}
            onClick={() => navigate(item.slug)}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      {unitId && (
        <select
          className="property-unit-switch"
          aria-label="Property and unit"
          value={unitId}
          onChange={(event) => w.go('unit', event.target.value, value)}
        >
          {w.data.properties.map((property) => (
            <optgroup label={property.name} key={property.id}>
              {w.data.units
                .filter((unit) => unit.propertyId === property.id)
                .map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {property.name} · {unit.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      )}
      <select
        className="unit-more-nav"
        aria-label="More property sections"
        value={extraSections.some((item) => item.slug === value) ? value : ''}
        onChange={(event) => navigate(event.target.value)}
      >
        <option value="" disabled>
          More sections
        </option>
        {extraSections.map((item) => (
          <option key={item.slug} value={item.slug}>
            {item.label === 'History' ? 'Guide history' : item.label}
          </option>
        ))}
      </select>
    </nav>
  );
}
