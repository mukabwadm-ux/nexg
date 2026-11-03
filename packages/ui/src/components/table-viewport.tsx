'use client';
/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- Native scroll regions require keyboard focus for scrolling. */

import * as React from 'react';
import { cn } from '../lib/cn';

export interface TableViewportProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
}

/** A table keeps its own scroll position; its scrollbar fades after interaction. */
export const TableViewport = React.forwardRef<HTMLDivElement, TableViewportProps>(
  function TableViewport(
    {
      label,
      className,
      children,
      onPointerDownCapture,
      onPointerMoveCapture,
      onScroll,
      onWheelCapture,
      onFocusCapture,
      onKeyDownCapture,
      ...props
    },
    ref,
  ) {
    const [active, setActive] = React.useState(false);
    const idle = React.useRef<ReturnType<typeof setTimeout>>();
    const reveal = React.useCallback(() => {
      setActive(true);
      clearTimeout(idle.current);
      idle.current = setTimeout(() => setActive(false), 1200);
    }, []);
    React.useEffect(() => () => clearTimeout(idle.current), []);
    return (
      <div
        {...props}
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        className={cn('ui-table-viewport', className)}
        data-table-viewport
        data-scroll-active={active ? 'true' : 'false'}
        onPointerDownCapture={(event) => {
          reveal();
          onPointerDownCapture?.(event);
        }}
        onPointerMoveCapture={(event) => {
          if (event.buttons) reveal();
          onPointerMoveCapture?.(event);
        }}
        onScroll={(event) => {
          reveal();
          onScroll?.(event);
        }}
        onWheelCapture={(event) => {
          reveal();
          onWheelCapture?.(event);
        }}
        onFocusCapture={(event) => {
          reveal();
          onFocusCapture?.(event);
        }}
        onKeyDownCapture={(event) => {
          reveal();
          onKeyDownCapture?.(event);
        }}
      >
        {children}
      </div>
    );
  },
);
