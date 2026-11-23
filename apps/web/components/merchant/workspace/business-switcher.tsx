'use client';

import { Check, ChevronDown, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { switchBusiness } from '@/app/merchant/switch-business-actions';

import { ADD_BUSINESS_HREF } from './add-business';
import styles from './workspace.module.css';

export interface WorkspaceBusiness {
  id: string;
  name: string;
  /** Live, In review, Draft, Paused… */
  label: string;
}

/**
 * Under the business name in the sidebar (and the phone drawer): the other
 * businesses this sign-in owns or manages, and Add business. With one
 * business there is nothing to switch to, so only Add business shows.
 *
 * Choosing a business posts to a server action, which checks the membership,
 * remembers the choice and reopens /merchant. Works without JavaScript.
 */
export function BusinessSwitcher({
  businesses,
  currentId,
}: {
  businesses: readonly WorkspaceBusiness[];
  currentId: string;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (details.current) details.current.open = false;
  }, [pathname]);
  useEffect(() => {
    const close = (event: PointerEvent | KeyboardEvent) => {
      const element = details.current;
      if (!element?.open) return;
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !element.contains(event.target as Node)
      )
        element.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);

  if (businesses.length <= 1)
    return (
      <div className={styles.businessSwitcher}>
        <Link href={ADD_BUSINESS_HREF} prefetch={false} className={styles.addBusinessLink}>
          <Plus size={13} aria-hidden="true" />
          Add business
        </Link>
      </div>
    );

  return (
    <div className={styles.businessSwitcher}>
      <details ref={details} className={styles.switcherDetails}>
        <summary className={styles.switcherSummary}>
          <span>Switch business</span>
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <ul className={styles.switcherMenu} aria-label="Your businesses">
          {businesses.map((business) => {
            const current = business.id === currentId;
            return (
              <li key={business.id}>
                <form
                  action={switchBusiness}
                  onSubmit={() => {
                    // The workspace reopens on the same address, so close the menu here.
                    if (details.current) details.current.open = false;
                  }}
                >
                  <input type="hidden" name="merchantId" value={business.id} />
                  <button
                    type="submit"
                    className={styles.switcherItem}
                    aria-current={current ? 'true' : undefined}
                    disabled={current}
                    data-workspace-navigation-action
                  >
                    <span className={styles.switcherName}>{business.name}</span>
                    <span className={styles.switcherStatus}>{business.label}</span>
                    {current ? <Check size={13} aria-label="Current business" /> : null}
                  </button>
                </form>
              </li>
            );
          })}
          <li>
            <Link
              href={ADD_BUSINESS_HREF}
              prefetch={false}
              className={`${styles.switcherItem} ${styles.switcherAdd}`}
            >
              <Plus size={13} aria-hidden="true" />
              Add business
            </Link>
          </li>
        </ul>
      </details>
    </div>
  );
}
