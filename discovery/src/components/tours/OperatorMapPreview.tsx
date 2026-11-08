import { ExternalLink, MapPin } from 'lucide-react';
import type { Merchant } from '../../providers/DiscoveryProvider';

/** Only source coordinates get a pin. Otherwise show a labelled city overview. */
export function OperatorMapPreview({ merchant }: { merchant: Merchant }) {
  const lat = merchant.latitude;
  const lon = merchant.longitude;
  const exact = lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const nairobi = /\bNairobi\b/i.test(merchant.address ?? '');
  const map = exact ? `https://www.openstreetmap.org/export/embed.html?bbox=${lon - .018},${lat - .012},${lon + .018},${lat + .012}&layer=mapnik&marker=${lat},${lon}` : nairobi ? 'https://www.openstreetmap.org/export/embed.html?bbox=36.63,-1.44,37.10,-1.12&layer=mapnik' : undefined;
  const search = new URLSearchParams({ api: '1', query: merchant.address || `${merchant.name} ${merchant.area ?? ''}` });
  return <section className="operator-map" aria-label="Operator map preview">
    <div className="operator-map__canvas">{map ? <iframe title={exact ? `${merchant.name} operator location` : 'Nairobi area overview, exact operator location unconfirmed'} src={map} loading="lazy" referrerPolicy="no-referrer" /> : <div className="operator-map__empty"><MapPin size={30} aria-hidden="true" /><span>Map location not provided</span></div>}</div>
    <div className="operator-map__caption"><div><h3><MapPin size={16} aria-hidden="true" />{merchant.area ? `Operator in ${merchant.area}` : merchant.name}</h3><p>{exact ? 'Operator location, not a trip route.' : nairobi ? 'Nairobi overview. Exact operator pin not provided.' : 'The operator has not supplied coordinates.'}</p></div><a href={`https://www.google.com/maps/search/?${search}`} target="_blank" rel="noreferrer" aria-label={`Find ${merchant.name} address on Google Maps`}><ExternalLink size={18} aria-hidden="true" /></a></div>
  </section>;
}
