import { useEffect, useRef } from 'react';
import type { ObservationBinding } from '../providers/DiscoveryProvider';
import { VisibilityQualifier } from '../observations/visibility';
import { sendObservation } from '../observations/client';

/** Opt-in only: no token means no observer/listener, no network or persistent queue. */
export function useResultObservation(binding?: ObservationBinding) {
  const ref = useRef<HTMLElement>(null);
  const current = useRef(binding); current.current = binding;
  const key = binding ? JSON.stringify(binding.delivery) : '';
  useEffect(() => {
    const element = ref.current;
    if (!key || !element || typeof IntersectionObserver === 'undefined') return;
    const qualifier = new VisibilityQualifier(); let ratio = 0; let timer: ReturnType<typeof setTimeout> | undefined;
    const sample = () => {
      clearTimeout(timer); timer = undefined;
      const active = document.visibilityState === 'visible' && document.hasFocus();
      const exposure = qualifier.sample(performance.now(), ratio, active);
      if (exposure) sendObservation(current.current, 'result_exposed', exposure);
      else if (!qualifier.qualified && active && ratio >= 0.5) timer = setTimeout(sample, 1000);
    };
    const observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.target === element) { ratio = entry.intersectionRatio; sample(); } }, { threshold: [0, 0.5, 1] });
    const reset = () => { clearTimeout(timer); qualifier.sample(performance.now(), 0, false); };
    const visibility = () => { if (document.visibilityState === 'hidden') reset(); else sample(); };
    observer.observe(element); document.addEventListener('visibilitychange', visibility); window.addEventListener('blur', reset); window.addEventListener('focus', sample);
    return () => { clearTimeout(timer); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', reset); window.removeEventListener('focus', sample); };
  }, [key]);
  return { ref, detailOpened: () => sendObservation(current.current, 'detail_opened') };
}
