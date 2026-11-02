import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import styles from './workspace.module.css';

export type WorkspaceFrameProps = {
  children: ReactNode;
  activeLabel: string;
  businessName?: string;
  accountInitials?: string;
  navigation: ReactNode;
  /** Replaces the complete left header content, including its breadcrumb. */
  headerStart?: ReactNode;
  headerEnd?: ReactNode;
  /** Rendered between the left and right header groups. */
  headerMiddle?: ReactNode;
  /** Breadcrumb content used when headerStart is omitted. */
  breadcrumb?: ReactNode;
  bounded?: boolean;
  /** Replaces the complete sidebar identity block, including its home control. */
  sidebarHome?: ReactNode;
};

export function WorkspaceFrame({
  children,
  activeLabel,
  businessName = 'Merchant workspace',
  accountInitials = 'NC',
  navigation,
  headerStart,
  headerEnd,
  headerMiddle,
  breadcrumb,
  bounded = false,
  sidebarHome,
}: WorkspaceFrameProps) {
  return (
    <div className={styles.shell} data-merchant-workspace>
      <aside className={styles.sidebar} aria-label="Workspace sidebar">
        {sidebarHome ?? (
          <div className={styles.sidebarContext}>
            <span className={styles.businessAvatar} aria-hidden="true">
              {accountInitials}
            </span>
            <div>
              <strong>{businessName}</strong>
              <small>Business workspace</small>
            </div>
          </div>
        )}
        {navigation}
        <div className={styles.sidebarFooter}>
          <strong>NEXG merchant portal</strong>
          <span>Kenya · East Africa Time</span>
        </div>
      </aside>

      <div className={styles.frame}>
        <header className={styles.header}>
          <div className={styles.headerStart}>
            {headerStart ?? (
              <div className={styles.breadcrumb} aria-label="Breadcrumb">
                {breadcrumb ?? (
                  <>
                    <span>Workspace</span>
                    <ChevronRight size={13} aria-hidden="true" />
                    <span>{activeLabel}</span>
                  </>
                )}
              </div>
            )}
          </div>
          {headerMiddle}
          <div className={styles.headerEnd}>{headerEnd}</div>
        </header>
        <div
          className={`${styles.body} ${bounded ? styles.boundedBody : ''}`}
          data-workspace-content
        >
          {children}
        </div>
      </div>
    </div>
  );
}
