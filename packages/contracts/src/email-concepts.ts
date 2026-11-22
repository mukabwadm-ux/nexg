/**
 * The house email designs' sample words, one per design in
 * docs/merchant-portal-plan/email-concept. Written by
 * scripts/generate-email-samples.mjs from its catalogue.json; do not edit.
 */
import type { EmailContent } from './email-design';

export interface EmailConcept {
  id: string;
  name: string;
  group: string;
  subject: string;
  trigger: string;
  content: EmailContent;
}

export const EMAIL_CONCEPTS: EmailConcept[] = [
  {
    id: '01-email-verification-otp',
    name: 'Welcome and verify email',
    group: 'Access & security',
    subject: 'Welcome to NEXG — verify your email',
    trigger: 'A merchant requests email verification.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'WELCOME TO NEXG',
      tone: 'gold',
      title: 'Welcome to NEXG',
      greeting: 'Hi Amina,',
      intro:
        'Thanks for creating your NEXG merchant account. Enter the code below to verify your email and continue.',
      code: '482916',
      codeLabel: 'YOUR VERIFICATION CODE',
      expiry: 'Expires in 30 minutes',
      actionNote:
        'Enter this code on the NEXG sign-up page to verify your email and continue setup.',
      callout: {
        title: 'Keep this code private',
        body: 'NEXG will never ask you to share this code. If you did not request it, you can ignore this email.',
        warning: true,
      },
      preheader: 'Your six-digit verification code expires in 30 minutes.',
    },
  },
  {
    id: '02-sign-in-otp',
    name: 'Sign-in OTP',
    group: 'Access & security',
    subject: '482916 is your NEXG sign-in code',
    trigger: 'A merchant requests a passwordless sign-in code.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'SECURE SIGN-IN',
      tone: 'gold',
      title: 'Your sign-in code is here',
      greeting: 'Hi Amina,',
      intro:
        'Use this code to sign in to your NEXG merchant account. Enter it on the page where you started signing in.',
      code: '482916',
      codeLabel: 'YOUR ONE-TIME CODE',
      expiry: 'Expires in 30 minutes',
      actionNote: 'This code can be used once.',
      callout: {
        title: 'Only you should use this code',
        body: 'Do not forward or share it. If you did not request a code, ignore this email and review your account security.',
        warning: true,
      },
      preheader: 'Use this one-time code to sign in. It expires in 30 minutes.',
    },
  },
  {
    id: '03-password-reset',
    name: 'Password reset',
    group: 'Access & security',
    subject: 'Reset your NEXG password',
    trigger: 'An account owner requests password recovery.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'ACCOUNT RECOVERY',
      tone: 'gold',
      title: 'Reset your password',
      greeting: 'Hi Amina,',
      intro:
        'We received a request to reset the password for your NEXG account. Follow the secure link to choose a new password.',
      action: {
        label: 'Reset password',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote: 'This link is intended for the account owner only.',
      callout: {
        title: 'Did not request this?',
        body: 'You can ignore this email. Your password will stay the same unless you complete the reset.',
      },
      preheader: 'You requested a password reset. Choose a new password securely.',
    },
  },
  {
    id: '04-password-changed',
    name: 'Password changed',
    group: 'Access & security',
    subject: 'Your NEXG password was changed',
    trigger: 'The authentication service confirms a password change.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'SECURITY NOTICE',
      tone: 'green',
      title: 'Your password has changed',
      greeting: 'Hi Amina,',
      intro:
        'The password for your NEXG account was changed. If you made this change, there is nothing else to do.',
      rows: [
        ['Account', 'a••••@example.com'],
        ['Changed at', '1 Nov 2026, 10:24 EAT'],
      ],
      action: {
        label: 'Review account security',
        url: 'https://www.nexgapp.com/merchant',
      },
      callout: {
        title: 'Was this someone else?',
        body: 'Open NEXG directly to recover your account, review active sessions and contact support.',
        warning: true,
      },
      preheader: 'Review this account security change if it was not you.',
    },
  },
  {
    id: '05-new-sign-in',
    name: 'New sign-in alert',
    group: 'Access & security',
    subject: 'A new sign-in to your NEXG account',
    trigger: 'A supported security service identifies a new-device sign-in.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'ACCOUNT ACTIVITY',
      tone: 'amber',
      title: 'Was this you signing in?',
      greeting: 'Hi Amina,',
      intro:
        'We noticed a sign-in to your NEXG merchant account from a device you have not used before.',
      rows: [
        ['Device', 'Chrome on Windows'],
        ['Time', '1 Nov 2026, 10:24 EAT'],
        ['Business', 'Karibu Kitchen'],
      ],
      action: {
        label: 'Review account security',
        url: 'https://www.nexgapp.com/merchant',
      },
      callout: {
        title: 'Do not recognise this activity?',
        body: 'Open NEXG directly to review your sessions and secure your account. Contact support if you need help.',
        warning: true,
      },
      preheader: 'Check the device and time for this sign-in.',
    },
  },
  {
    id: '06-email-change-confirmation',
    name: 'Confirm email change',
    group: 'Access & security',
    subject: 'Confirm your NEXG email change',
    trigger: 'The account owner requests an email-address change.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'CONFIRM ACCOUNT CHANGE',
      tone: 'gold',
      title: 'Confirm your email change',
      greeting: 'Hi Amina,',
      intro:
        'You asked to change the email address on your NEXG account. Confirm this request to continue.',
      rows: [
        ['Current email', 'a••••@example.com'],
        ['New email', 'o••••@example.com'],
      ],
      action: {
        label: 'Confirm email change',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote: 'Complete every confirmation requested by NEXG before the change takes effect.',
      callout: {
        title: 'Did not request this change?',
        body: 'Do not confirm it. Open NEXG directly to review your account security and contact support.',
        warning: true,
      },
      preheader: 'Confirm the request to update your account email address.',
    },
  },
  {
    id: '07-welcome',
    name: 'Finish setting up',
    group: 'Onboarding & verification',
    subject: 'Your email is verified — continue setting up NEXG',
    trigger: 'A merchant successfully verifies the email address used to create their account.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'EMAIL VERIFIED',
      tone: 'gold',
      title: 'Your business setup starts here',
      greeting: 'Hi Amina,',
      intro:
        'Your email is verified. Continue setting up Karibu Kitchen so we can review the details your business needs.',
      steps: [
        'Complete your business details.',
        'Add the documents requested for your business.',
        'Set up your offerings and availability.',
      ],
      action: {
        label: 'Continue setup',
        url: 'https://www.nexgapp.com/merchant',
      },
      callout: {
        title: 'Your business is not live yet',
        body: 'We will show your verification and publication status in your workspace.',
      },
      preheader: 'Add your business details, documents and offerings in your workspace.',
    },
  },
  {
    id: '08-application-received',
    name: 'Application received',
    group: 'Onboarding & verification',
    subject: 'We have your Karibu Kitchen application',
    trigger: 'The application service confirms a complete application submission.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'APPLICATION RECEIVED',
      tone: 'blue',
      title: 'Your application is with us',
      greeting: 'Hi Amina,',
      intro:
        'We have received the business application for Karibu Kitchen. We will email you if we need more information or when the review status changes.',
      rows: [
        ['Business', 'Karibu Kitchen'],
        ['Reference', 'NXG-APP-1042'],
        ['Status', 'Under review'],
      ],
      action: {
        label: 'View application status',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote: 'You can return to your workspace to check the latest status.',
      preheader: 'You can follow the review in your merchant workspace.',
    },
  },
  {
    id: '09-documents-action-required',
    name: 'Documents need attention',
    group: 'Onboarding & verification',
    subject: 'A document needs updating for Karibu Kitchen',
    trigger: 'A reviewer records a document issue with an actionable reason.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'ACTION REQUIRED',
      tone: 'amber',
      title: 'Please update this document',
      greeting: 'Hi Amina,',
      intro:
        'We could not complete the review of one document for Karibu Kitchen. You can see the review note and upload a replacement in your workspace.',
      rows: [
        ['Document', 'Business permit'],
        ['Review note', 'The expiry date is not readable.'],
        ['Reference', 'NXG-APP-1042'],
      ],
      action: {
        label: 'Review and upload document',
        url: 'https://www.nexgapp.com/merchant',
      },
      callout: {
        title: 'Send documents securely',
        body: 'Upload the replacement in NEXG. Please do not reply with identity or business documents attached.',
      },
      preheader: 'Review the reason and upload an updated document.',
    },
  },
  {
    id: '10-business-approved',
    name: 'Business approved',
    group: 'Onboarding & verification',
    subject: 'Karibu Kitchen has been approved',
    trigger: 'The verification authority approves the business application.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'BUSINESS APPROVED',
      tone: 'green',
      title: 'Your business review is complete',
      greeting: 'Hi Amina,',
      intro:
        'Karibu Kitchen has passed the business review. Open your workspace to check the remaining setup and publication status.',
      rows: [
        ['Business', 'Karibu Kitchen'],
        ['Review status', 'Approved'],
        ['Publication status', 'Setup to complete'],
      ],
      action: {
        label: 'Review go-live setup',
        url: 'https://www.nexgapp.com/merchant',
      },
      callout: {
        title: 'Approval and publication are separate',
        body: 'Your workspace will confirm when your business is live and available to customers.',
      },
      preheader: 'Review the remaining setup before your business goes live.',
    },
  },
  {
    id: '11-application-not-approved',
    name: 'Application not approved',
    group: 'Onboarding & verification',
    subject: 'An update on the Karibu Kitchen application',
    trigger: 'A reviewer records an authoritative not-approved decision.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'APPLICATION UPDATE',
      tone: 'amber',
      title: 'We could not approve this application',
      greeting: 'Hi Amina,',
      intro:
        'We have completed the review of Karibu Kitchen. The application has not been approved. Please review the decision and any available next steps in your workspace.',
      rows: [
        ['Reference', 'NXG-APP-1042'],
        ['Review reason', 'Required business information could not be verified.'],
      ],
      action: {
        label: 'Review application decision',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote: 'If you believe the information is incorrect, contact NEXG support.',
      preheader: 'Review the decision and the next steps available to you.',
    },
  },
  {
    id: '12-document-expiring',
    name: 'Document expiring',
    group: 'Onboarding & verification',
    subject: 'A Karibu Kitchen document expires soon',
    trigger: 'A verified required document reaches a configured expiry reminder threshold.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'DOCUMENT REMINDER',
      tone: 'amber',
      title: 'Your document needs renewal',
      greeting: 'Hi Amina,',
      intro:
        'A document on the Karibu Kitchen account is approaching its expiry date. Upload the renewed document when it is available.',
      rows: [
        ['Document', 'Business permit'],
        ['Expires on', '30 Nov 2026'],
        ['Business', 'Karibu Kitchen'],
      ],
      action: {
        label: 'Update business document',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote: 'Your workspace shows any effect this document has on your business status.',
      preheader: 'Review and update the document before its expiry date.',
    },
  },
  {
    id: '13-new-order',
    name: 'New confirmed order',
    group: 'Orders & bookings',
    subject: 'New confirmed order NXG-1048',
    trigger: 'The authoritative order and stock operation confirms an ordinary order.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'ORDER CONFIRMED',
      tone: 'green',
      title: 'A new order is ready for preparation',
      greeting: 'Hi Amina,',
      intro:
        'Order NXG-1048 for Karibu Kitchen has been confirmed. Open the work details to follow the preparation and handover steps.',
      amount: 'KES 2,800',
      amountLabel: 'ORDER TOTAL',
      rows: [
        ['Order', 'NXG-1048'],
        ['Items', '3 items'],
        ['Fulfilment', 'Collection'],
        ['Collection time', '1 Nov 2026, 13:30 EAT'],
      ],
      action: {
        label: 'Open order',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote:
        'Customer details and preparation notes are available securely in your workspace.',
      preheader: 'The order is confirmed. Open your workspace to start preparation.',
    },
  },
  {
    id: '14-booking-confirmed',
    name: 'Booking confirmed',
    group: 'Orders & bookings',
    subject: 'Booking NXG-B218 is confirmed',
    trigger: 'The authoritative booking operation confirms the required slot and resources.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'BOOKING CONFIRMED',
      tone: 'green',
      title: 'A booking has been confirmed',
      greeting: 'Hi Amina,',
      intro:
        'The source system has confirmed booking NXG-B218 for Karibu Kitchen. Review the time and the work details in your workspace.',
      rows: [
        ['Booking', 'NXG-B218'],
        ['Date', '3 Nov 2026'],
        ['Time', '18:30 EAT'],
        ['Service', 'Table booking'],
        ['Party size', '4 guests'],
      ],
      action: {
        label: 'View booking',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote: 'Open the booking for customer details and any permitted service notes.',
      preheader: 'View the confirmed time and preparation details in NEXG.',
    },
  },
  {
    id: '15-work-cancelled',
    name: 'Order or booking cancelled',
    group: 'Orders & bookings',
    subject: 'Order NXG-1048 has been cancelled',
    trigger: 'An authoritative order or booking cancellation is recorded.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'CANCELLATION UPDATE',
      tone: 'amber',
      title: 'This order has been cancelled',
      greeting: 'Hi Amina,',
      intro:
        'The source system has confirmed the cancellation of order NXG-1048. Review the record before taking any further preparation or handover action.',
      rows: [
        ['Order', 'NXG-1048'],
        ['Status', 'Cancelled'],
        ['Recorded at', '1 Nov 2026, 12:48 EAT'],
      ],
      action: {
        label: 'View cancellation details',
        url: 'https://www.nexgapp.com/merchant',
      },
      callout: {
        title: 'Payment status is separate',
        body: 'Open Money for any confirmed refund or adjustment linked to this order.',
      },
      preheader: 'Review the cancellation and any remaining work in your workspace.',
    },
  },
  {
    id: '16-customer-message',
    name: 'New customer message',
    group: 'Orders & bookings',
    subject: 'A new message about order NXG-1048',
    trigger: 'A permitted merchant conversation receives a new customer message.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'NEW MESSAGE',
      tone: 'blue',
      title: 'There is a message for your business',
      greeting: 'Hi Amina,',
      intro:
        'A new customer message is waiting for Karibu Kitchen about order NXG-1048. Open NEXG to read it and reply.',
      rows: [
        ['Related work', 'Order NXG-1048'],
        ['Received', '1 Nov 2026, 12:40 EAT'],
      ],
      action: {
        label: 'Read message in NEXG',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote: 'Customer information and the message content stay in your workspace.',
      preheader: 'Read and reply securely from your merchant workspace.',
    },
  },
  {
    id: '17-payment-received',
    name: 'Customer payment received',
    group: 'Money',
    subject: 'Payment confirmed for order NXG-1048',
    trigger: 'A verified payment provider event confirms customer payment.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'PAYMENT CONFIRMED',
      tone: 'green',
      title: 'A customer payment is confirmed',
      greeting: 'Hi Amina,',
      intro:
        'The payment provider has confirmed a customer payment linked to order NXG-1048 for Karibu Kitchen.',
      amount: 'KES 2,800',
      amountLabel: 'CUSTOMER PAYMENT',
      rows: [
        ['Order', 'NXG-1048'],
        ['Payment reference', 'PAY-78412'],
        ['Method', 'M-Pesa'],
        ['Recorded at', '1 Nov 2026, 12:35 EAT'],
      ],
      action: {
        label: 'View payment details',
        url: 'https://www.nexgapp.com/merchant',
      },
      callout: {
        title: 'Payment is not a payout',
        body: 'Your available merchant balance and any fees or adjustments are shown separately in Money.',
      },
      preheader: 'The payment provider has confirmed the customer payment.',
    },
  },
  {
    id: '18-payout-sent',
    name: 'Payout initiated',
    group: 'Money',
    subject: 'Your KES 18,450 payout has been initiated',
    trigger: 'The payout provider authoritatively accepts a transfer initiation.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'PAYOUT INITIATED',
      tone: 'blue',
      title: 'Your payout is on its way',
      greeting: 'Hi Amina,',
      intro:
        'The payout provider has accepted a transfer for Karibu Kitchen. You can follow its progress in Money.',
      amount: 'KES 18,450',
      amountLabel: 'PAYOUT AMOUNT',
      rows: [
        ['Payout', 'PYO-6208'],
        ['Destination', 'Bank account ending 4821'],
        ['Provider status', 'Transfer initiated'],
        ['Date', '1 Nov 2026'],
      ],
      action: {
        label: 'Track payout',
        url: 'https://www.nexgapp.com/merchant',
      },
      callout: {
        title: 'Receipt is still pending',
        body: 'This notice confirms initiation. Your bank or payout provider must confirm receipt before the payout is complete.',
      },
      preheader: 'Follow the payout status and destination in Money.',
    },
  },
  {
    id: '19-payout-failed',
    name: 'Payout failed',
    group: 'Money',
    subject: 'Action needed for payout PYO-6208',
    trigger: 'The payout provider confirms a failed transfer.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'PAYOUT ACTION REQUIRED',
      tone: 'red',
      title: 'Your payout could not be completed',
      greeting: 'Hi Amina,',
      intro:
        'The payout provider reported that payout PYO-6208 for Karibu Kitchen failed. Review the reason and the supported next steps in Money.',
      amount: 'KES 18,450',
      amountLabel: 'PAYOUT AMOUNT',
      rows: [
        ['Payout', 'PYO-6208'],
        ['Destination', 'Bank account ending 4821'],
        ['Provider reason', 'Destination account could not be verified.'],
      ],
      action: {
        label: 'Review payout issue',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote: 'Update payout details only from your secure NEXG workspace.',
      preheader: 'Review the provider reason and supported next steps in Money.',
    },
  },
  {
    id: '20-refund-completed',
    name: 'Refund processed',
    group: 'Money',
    subject: 'Refund processed for order NXG-1029',
    trigger: 'The authoritative refund provider marks a refund as processed.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'REFUND UPDATE',
      tone: 'blue',
      title: 'The refund has been processed',
      greeting: 'Hi Amina,',
      intro:
        'The payment provider has marked the refund for order NXG-1029 as processed. Review its effect on the transaction and merchant balance in Money.',
      amount: 'KES 1,200',
      amountLabel: 'REFUND AMOUNT',
      rows: [
        ['Order', 'NXG-1029'],
        ['Refund reference', 'RFD-3186'],
        ['Provider status', 'Processed'],
      ],
      action: {
        label: 'View refund details',
        url: 'https://www.nexgapp.com/merchant',
      },
      callout: {
        title: 'Customer posting may take longer',
        body: 'Provider processing does not confirm that the customer bank or wallet has posted the refund.',
      },
      preheader: 'The provider has processed the refund. Customer posting may still be pending.',
    },
  },
  {
    id: '21-statement-ready',
    name: 'Statement ready',
    group: 'Money',
    subject: 'Your October 2026 NEXG statement is ready',
    trigger: 'The statement service confirms that a scoped statement is available.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'MONTHLY STATEMENT',
      tone: 'gold',
      title: 'Your statement is ready to review',
      greeting: 'Hi Amina,',
      intro:
        'The October 2026 statement for Karibu Kitchen is ready in Money. Open the statement to review the transactions and balance movements for the period.',
      rows: [
        ['Business', 'Karibu Kitchen'],
        ['Statement period', '1–31 Oct 2026'],
        ['Currency', 'KES'],
      ],
      action: {
        label: 'Open statement',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote: 'Sign in with an account that has permission to view business finances.',
      preheader: 'Open Money to review the statement for Karibu Kitchen.',
    },
  },
  {
    id: '22-payout-details-changed',
    name: 'Payout details changed',
    group: 'Money',
    subject: 'Payout details changed for Karibu Kitchen',
    trigger: 'The payout-settings authority confirms an authenticated destination change.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'FINANCIAL SECURITY',
      tone: 'amber',
      title: 'Your payout destination has changed',
      greeting: 'Hi Amina,',
      intro:
        'An authorized change to the payout details for Karibu Kitchen was recorded. Review the destination in your secure workspace.',
      rows: [
        ['Business', 'Karibu Kitchen'],
        ['New destination', 'Bank account ending 4821'],
        ['Changed at', '1 Nov 2026, 10:24 EAT'],
      ],
      action: {
        label: 'Review payout settings',
        url: 'https://www.nexgapp.com/merchant',
      },
      callout: {
        title: 'Do not recognise this change?',
        body: 'Open NEXG directly and contact support immediately. Review account access before making another payout change.',
        warning: true,
      },
      preheader: 'Review this change to your business payout destination.',
    },
  },
  {
    id: '23-team-invitation',
    name: 'Team invitation',
    group: 'Team & account',
    subject: 'You are invited to Karibu Kitchen on NEXG',
    trigger: 'An authorized team administrator issues an invitation.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'TEAM INVITATION',
      tone: 'gold',
      title: 'Join your team on NEXG',
      greeting: 'Hi Sam,',
      intro:
        'Amina has invited you to the Karibu Kitchen merchant workspace. Review the invitation and the role before joining.',
      rows: [
        ['Business', 'Karibu Kitchen'],
        ['Invited by', 'Amina'],
        ['Proposed role', 'Operations'],
        ['Access scope', 'Work and availability'],
      ],
      action: {
        label: 'Review invitation',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote: 'If you do not recognise this business or invitation, you can ignore this email.',
      preheader: 'Review the business and role before joining its workspace.',
    },
  },
  {
    id: '24-team-access-changed',
    name: 'Team access changed',
    group: 'Team & account',
    subject: 'Your Karibu Kitchen access has changed',
    trigger: 'The permissions authority confirms a team role or grant change.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'TEAM ACCESS UPDATE',
      tone: 'blue',
      title: 'Your workspace access has changed',
      greeting: 'Hi Sam,',
      intro:
        'An administrator updated your access to the Karibu Kitchen workspace. Your available actions now follow the permissions on your account.',
      rows: [
        ['Business', 'Karibu Kitchen'],
        ['Role', 'Operations'],
        ['Access scope', 'Work and availability'],
        ['Updated at', '1 Nov 2026, 10:24 EAT'],
      ],
      action: {
        label: 'View my access',
        url: 'https://www.nexgapp.com/merchant',
      },
      callout: {
        title: 'Need a different level of access?',
        body: 'Contact your business administrator. A role change does not automatically authorize financial or connected-provider access.',
      },
      preheader: 'Review your updated role and permissions in NEXG.',
    },
  },
  {
    id: '25-account-restricted',
    name: 'Business restricted',
    group: 'Team & account',
    subject: 'Karibu Kitchen needs your attention',
    trigger: 'The business-status authority records a restriction, suspension or pause.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'BUSINESS STATUS UPDATE',
      tone: 'red',
      title: 'Your business has been restricted',
      greeting: 'Hi Amina,',
      intro:
        'A restriction has been recorded for Karibu Kitchen. Open your workspace to review what is affected and the next steps available to you.',
      rows: [
        ['Business', 'Karibu Kitchen'],
        ['Affected area', 'New customer orders'],
        ['Reason', 'Required verification needs review.'],
      ],
      action: {
        label: 'Review business status',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote: 'You can contact NEXG support if you need help understanding the decision.',
      preheader: 'Review the account restriction and the next steps available to you.',
    },
  },
  {
    id: '26-account-restored',
    name: 'Business access restored',
    group: 'Team & account',
    subject: 'The restriction on Karibu Kitchen has been removed',
    trigger: 'The business-status authority confirms removal of a restriction.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'BUSINESS STATUS UPDATE',
      tone: 'green',
      title: 'Your business access is restored',
      greeting: 'Hi Amina,',
      intro:
        'The recorded restriction on Karibu Kitchen has been removed. Open your workspace to check the latest business status and any remaining setup.',
      rows: [
        ['Business', 'Karibu Kitchen'],
        ['Restriction', 'Removed'],
        ['Updated at', '1 Nov 2026, 10:24 EAT'],
      ],
      action: {
        label: 'Open merchant workspace',
        url: 'https://www.nexgapp.com/merchant',
      },
      callout: {
        title: 'Check your publication status',
        body: 'Access restoration does not by itself confirm that your business is live or that every connected service is available.',
      },
      preheader: 'Check the latest business and publication status in your workspace.',
    },
  },
  {
    id: '27-support-received',
    name: 'Support request received',
    group: 'Support',
    subject: 'We have your message · SUP-2468',
    trigger: 'The support service creates a support ticket successfully.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'SUPPORT REQUEST RECEIVED',
      tone: 'blue',
      title: 'Your support request is with us',
      greeting: 'Hi Amina,',
      intro:
        'We have received your message about Karibu Kitchen. A member of the NEXG support team will review it and reply using your contact details.',
      rows: [
        ['Reference', 'SUP-2468'],
        ['Business', 'Karibu Kitchen'],
        ['Status', 'Received'],
      ],
      action: {
        label: 'View support request',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote: 'Use reference SUP-2468 if you contact info@nexgapp.com.',
      preheader: 'Keep this reference if you need to follow up with NEXG support.',
    },
  },
  {
    id: '28-support-resolved',
    name: 'Support request resolved',
    group: 'Support',
    subject: 'Support request SUP-2468 has been resolved',
    trigger: 'The support service records a resolved ticket status.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'SUPPORT UPDATE',
      tone: 'green',
      title: 'Your support request is resolved',
      greeting: 'Hi Amina,',
      intro:
        'NEXG support has marked request SUP-2468 as resolved. Open the update to review the outcome for Karibu Kitchen.',
      rows: [
        ['Reference', 'SUP-2468'],
        ['Business', 'Karibu Kitchen'],
        ['Status', 'Resolved'],
      ],
      action: {
        label: 'Review support update',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote: 'You can contact info@nexgapp.com for help.',
      callout: {
        title: 'Still need help with this?',
        body: 'Contact NEXG support and quote SUP-2468 so we can review the same request.',
      },
      preheader: 'Review the update and contact support if the issue remains.',
    },
  },
  {
    id: '29-booking-updated',
    name: 'Booking updated',
    group: 'Orders & bookings',
    subject: 'Booking NXG-B218 has been updated',
    trigger: 'The authoritative booking service confirms a resource-valid booking change.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'BOOKING UPDATE',
      tone: 'blue',
      title: 'A booking time has changed',
      greeting: 'Hi Amina,',
      intro:
        'The source system has confirmed an update to booking NXG-B218 for Karibu Kitchen. Use the latest details below when planning the visit.',
      rows: [
        ['Booking', 'NXG-B218'],
        ['Date', '3 Nov 2026'],
        ['Previous time', '18:30 EAT'],
        ['Confirmed time', '19:00 EAT'],
        ['Party size', '4 guests'],
      ],
      action: {
        label: 'Review updated booking',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote:
        'Customer details and the complete change history are available in your workspace.',
      preheader: 'Check the confirmed booking time before preparing for the visit.',
    },
  },
  {
    id: '30-email-changed',
    name: 'Email address changed',
    group: 'Access & security',
    subject: 'Your NEXG account email has changed',
    trigger: 'The authentication authority confirms completion of an email-address change.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'SECURITY NOTICE',
      tone: 'green',
      title: 'Your account email has changed',
      greeting: 'Hi Amina,',
      intro:
        'The email address for your NEXG account has been updated after the required confirmations were completed.',
      rows: [
        ['Previous email', 'a••••@example.com'],
        ['New email', 'o••••@example.com'],
        ['Changed at', '1 Nov 2026, 10:24 EAT'],
      ],
      action: {
        label: 'Review account security',
        url: 'https://www.nexgapp.com/merchant',
      },
      callout: {
        title: 'Did not make this change?',
        body: 'Open NEXG directly and contact support immediately. Include no passwords or verification codes in your message.',
        warning: true,
      },
      preheader: 'Review this completed account change if it was not you.',
    },
  },
  {
    id: '31-business-live',
    name: 'Business is live',
    group: 'Onboarding & verification',
    subject: 'Karibu Kitchen is live on NEXG',
    trigger: 'The authoritative publication service confirms a merchant.live transition.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'YOUR BUSINESS IS LIVE',
      tone: 'green',
      title: 'Your business is live on NEXG',
      greeting: 'Hi Amina,',
      intro:
        'Karibu Kitchen is now published on NEXG. Customers can discover your business and use the services you have made available.',
      rows: [
        ['Business', 'Karibu Kitchen'],
        ['Publication status', 'Live'],
        ['Published at', '1 Nov 2026, 10:24 EAT'],
      ],
      action: {
        label: 'Open business workspace',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote: 'Check your current offerings, availability and business details.',
      preheader: 'Your business is now published and available to customers.',
    },
  },
  {
    id: '32-document-approved',
    name: 'Document approved',
    group: 'Onboarding & verification',
    subject: 'Your Karibu Kitchen document has been approved',
    trigger: 'A reviewer records approval of an assigned merchant document.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'DOCUMENT APPROVED',
      tone: 'green',
      title: 'Your document has been approved',
      greeting: 'Hi Amina,',
      intro:
        'We have approved the business permit you submitted for Karibu Kitchen. Open your workspace to see the status of any remaining documents.',
      rows: [
        ['Document', 'Business permit'],
        ['Review status', 'Approved'],
        ['Business', 'Karibu Kitchen'],
      ],
      action: {
        label: 'View verification status',
        url: 'https://www.nexgapp.com/merchant',
      },
      callout: {
        title: 'Check the full application status',
        body: 'Approval of this document does not confirm approval or publication of your business.',
      },
      preheader: 'The submitted document has passed review.',
    },
  },
  {
    id: '33-payout-completed',
    name: 'Payout completed',
    group: 'Money',
    subject: 'Payout PYO-6208 has been completed',
    trigger: 'A verified payout provider event confirms a terminal completed transfer status.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'PAYOUT COMPLETED',
      tone: 'green',
      title: 'Your payout is complete',
      greeting: 'Hi Amina,',
      intro:
        'The payout provider has confirmed that transfer PYO-6208 for Karibu Kitchen is complete. Review the provider confirmation in Money.',
      amount: 'KES 18,450',
      amountLabel: 'COMPLETED PAYOUT',
      rows: [
        ['Payout', 'PYO-6208'],
        ['Destination', 'Bank account ending 4821'],
        ['Provider status', 'Completed'],
        ['Confirmed at', '1 Nov 2026, 14:10 EAT'],
      ],
      action: {
        label: 'View payout confirmation',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote:
        'Contact support with this payout reference if you need help reconciling the transfer.',
      preheader: 'The payout provider has confirmed a completed transfer.',
    },
  },
  {
    id: '34-support-reply',
    name: 'Support has replied',
    group: 'Support',
    subject: 'A reply to support request SUP-2468',
    trigger: 'An authorized support agent publishes a reply visible to the requester.',
    content: {
      audience: 'MERCHANT',
      eyebrow: 'A REPLY FROM SUPPORT',
      tone: 'blue',
      title: 'Support has replied to your request',
      greeting: 'Hi Amina,',
      intro:
        'There is a new reply to your support request about Karibu Kitchen. Open the request to read the update and respond.',
      rows: [
        ['Reference', 'SUP-2468'],
        ['Business', 'Karibu Kitchen'],
        ['Status', 'Reply available'],
      ],
      action: {
        label: 'Read support reply',
        url: 'https://www.nexgapp.com/merchant',
      },
      actionNote: 'For help, contact info@nexgapp.com and quote SUP-2468.',
      preheader: 'Read the support update in your secure NEXG workspace.',
    },
  },
];
