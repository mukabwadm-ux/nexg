'use client';

import { createContext, useContext, type ReactNode } from 'react';
import {
  Button as AriaButton,
  Disclosure as AriaDisclosure,
  DisclosureGroup as AriaDisclosureGroup,
  DisclosurePanel as AriaDisclosurePanel,
  Heading as AriaHeading,
  type DisclosureGroupProps,
  type DisclosureProps,
} from 'react-aria-components';
import { Icon } from '../../../ui';
import './accordion.css';

export type AccordionVariant = 'divided' | 'contained' | 'separated';

const AccordionContext = createContext<{ indicator: 'chevron' | 'plus' }>({ indicator: 'chevron' });

export interface AccordionProps extends Omit<DisclosureGroupProps, 'className' | 'children'> {
  variant?: AccordionVariant;
  indicator?: 'chevron' | 'plus';
  className?: string;
  children: ReactNode;
}

export function Accordion({
  variant = 'divided',
  indicator = 'chevron',
  className = '',
  children,
  ...props
}: AccordionProps) {
  return (
    <AccordionContext.Provider value={{ indicator }}>
      <AriaDisclosureGroup
        {...props}
        data-variant={variant}
        className={`nexg-accordion ${className}`}
      >
        {children}
      </AriaDisclosureGroup>
    </AccordionContext.Provider>
  );
}

export interface AccordionItemProps extends Omit<DisclosureProps, 'className' | 'children'> {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  className?: string;
  children: ReactNode;
}

export function AccordionItem({
  title,
  description,
  icon,
  headingLevel = 3,
  className = '',
  children,
  ...props
}: AccordionItemProps) {
  const { indicator } = useContext(AccordionContext);
  return (
    <AriaDisclosure {...props} className={`nexg-accordion-item ${className}`}>
      <AriaHeading level={headingLevel} className="nexg-accordion-heading">
        <AriaButton
          slot="trigger"
          className={({ isFocusVisible }) =>
            `nexg-accordion-trigger${isFocusVisible ? 'is-focus-visible' : ''}`
          }
        >
          {icon && (
            <span className="nexg-accordion-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="nexg-accordion-label">
            <span className="nexg-accordion-title">{title}</span>
            {description && <span className="nexg-accordion-description">{description}</span>}
          </span>
          <span className={`nexg-accordion-indicator ${indicator}`} aria-hidden="true">
            <Icon name={indicator === 'plus' ? 'add' : 'right'} size={18} />
          </span>
        </AriaButton>
      </AriaHeading>
      <AriaDisclosurePanel className="nexg-accordion-panel">
        <div className="nexg-accordion-content">{children}</div>
      </AriaDisclosurePanel>
    </AriaDisclosure>
  );
}
