import type {
  MerchantWorkspaceNavLabel,
  MerchantWorkspaceNotice,
} from '@/components/merchant/workspace/merchant-workspace-shell';
import type { MerchantWorkspaceAccess } from '@/lib/merchant-access';

/**
 * Before approval the owner can still finish the two things the review
 * depends on: their business details and their documents. Everything
 * else stays locked until an admin has verified the documents.
 */
export function openBeforeApproval(
  label: MerchantWorkspaceNavLabel,
  access: MerchantWorkspaceAccess,
) {
  if (label === 'Home') return true;
  return access.setup && (label === 'Business' || label === 'Documents');
}

/** The message above every page, by where the application stands. */
export function verificationNotice(
  access: MerchantWorkspaceAccess,
  merchantId: string,
  isAnonymous: boolean,
): MerchantWorkspaceNotice | null {
  if (access.operations || access.state === 'legacy' || access.state === 'blocked') return null;
  if (access.review_state === 'approved' && !access.needs_resubmission)
    return isAnonymous
      ? {
          tone: 'action',
          title: 'Your account is approved',
          body: 'Verify your email to open the rest of your portal.',
        }
      : {
          tone: 'attention',
          title: 'Your account is approved but restricted',
          body: 'Your documents were approved, but the account is currently restricted. Contact NexG support to restore access.',
        };
  const review = {
    label: 'Review and submit',
    href: `/merchants/register?merchantId=${merchantId}`,
  };
  if (access.state === 'changes_requested' || access.needs_resubmission)
    return {
      tone: 'attention',
      title: 'Changes requested: please update and resubmit',
      body: 'An admin asked for changes before approving your account. See what to change on Home, update your Business details or Documents, then submit again.',
      action: access.setup ? review : undefined,
    };
  if (access.review_state === 'pending')
    return {
      tone: 'waiting',
      title: 'Your details are being verified',
      body: 'An admin is checking your business details and documents. The rest of your portal unlocks once they are approved. You can still update Business and Documents.',
    };
  return {
    tone: 'action',
    title: 'Please submit your details for verification',
    body: 'Complete your Business profile and upload your documents under Documents and evidence. Once you submit, an admin verifies them and unlocks the rest of your portal.',
    action: access.setup ? review : undefined,
  };
}
