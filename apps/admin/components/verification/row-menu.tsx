'use client';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@nexg/ui';
import { ExternalLink, FileText, MoreHorizontal, PanelRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

/** The "…" on a queue row: review it here, the merchant's record, and its application when it has one. */
export function VerificationRowMenu({
  merchantId,
  name,
  reviewHref,
  managed,
}: {
  merchantId: string;
  name: string;
  reviewHref: string;
  managed: boolean;
}) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`More for ${name}`}
          className="text-ink rounded-md p-1 hover:text-[#B57A00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A800]"
        >
          <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          icon={<PanelRight />}
          onSelect={() => router.push(reviewHref, { scroll: false })}
        >
          Review here
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={<ExternalLink />}
          onSelect={() => router.push(`/merchants/${merchantId}`)}
        >
          Open merchant record
        </DropdownMenuItem>
        {managed && (
          <DropdownMenuItem
            icon={<FileText />}
            onSelect={() => router.push(`/merchants/applications/${merchantId}`)}
          >
            Open full application
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
