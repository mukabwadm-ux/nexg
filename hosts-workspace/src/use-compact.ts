import { useEffect, useState } from 'react';

export function useCompact() {
  const query = '(max-width: 760px), (max-height: 740px)';
  const [compact, setCompact] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const change = () => setCompact(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [query]);
  return compact;
}
