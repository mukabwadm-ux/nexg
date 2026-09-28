'use client';

import { Button } from '@nexg/ui';
import { Printer } from 'lucide-react';

/**
 * The artboard offers "Download PDF". This prints instead, which every
 * browser turns into a PDF — and unlike a generated file it can never fall
 * out of date with the page someone is reading.
 *
 * The Kiswahili button on the artboard is not here: no translation exists,
 * and a language toggle that serves English is worse than no toggle.
 */
export function PrintButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      className="print:hidden"
      onClick={() => window.print()}
      leadingIcon={<Printer className="h-3.5 w-3.5" />}
    >
      Print or save as PDF
    </Button>
  );
}
