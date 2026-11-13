import { rejectDocument, verifyDocument } from '@/app/merchants/actions';
import { fileDocumentFor, remindToUpload } from '@/app/documents/actions';
import { DocumentReview, type ReviewDocument } from '@/components/document-review';

import { DocumentsLive } from './documents-live';

/**
 * A merchant's documents, for staff: view each file, verify or reject it,
 * upload one for them or replace one on record, and chase what is
 * missing. On the merchant page and on the application Review page, and
 * refreshed the moment the merchant uploads.
 */
export function MerchantDocumentsSection({
  merchantId,
  review,
  outstanding,
  onFile,
}: {
  merchantId: string;
  review: ReviewDocument[];
  outstanding: ReviewDocument[];
  onFile: number;
}) {
  const required = review.filter((d) => d.required).length;
  return (
    <section id="documents" aria-labelledby="documents-title" className="scroll-mt-24">
      <DocumentsLive merchantId={merchantId} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="documents-title" className="text-lg font-extrabold tracking-tight">
            Documents
          </h2>
          <p className="text-muted mt-1 text-sm font-semibold">
            {review.length === 0
              ? 'Nothing is asked for this merchant yet.'
              : outstanding.length === 0
                ? 'Everything required is verified.'
                : `${outstanding.length} of ${required} required still to verify · ${onFile} of ${review.length} on file.`}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <DocumentReview
          documents={review}
          onVerify={async (documentId) => {
            'use server';
            return verifyDocument(documentId, merchantId);
          }}
          onReject={async (documentId, reason) => {
            'use server';
            return rejectDocument(documentId, merchantId, reason);
          }}
          onRemind={async (kind) => {
            'use server';
            return remindToUpload('merchant', merchantId, kind);
          }}
          onFiled={async (input) => {
            'use server';
            return fileDocumentFor('merchant', merchantId, input);
          }}
          storagePrefix={`merchant/${merchantId}`}
        />
      </div>
    </section>
  );
}
