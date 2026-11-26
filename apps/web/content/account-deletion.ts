/*
 * What happens when a customer deletes their NexG account, shown on
 * /account/delete. Word for word the lists the database gives the app
 * (rpc_my_account_deletion, last defined in 20270327000200_chat_report_block_and_deletion);
 * account-deletion.test.ts keeps the two the same.
 */

/** The privacy contact the Privacy Policy names. */
export const PRIVACY_EMAIL = 'derrick@nexgapp.com';

export const DELETED_WITH_THE_ACCOUNT = [
  'Your sign-in, so you can no longer sign in with it',
  'Your name and phone number on your customer record',
  'Your saved places and delivery addresses',
  'Your saved items, preferences and notifications',
  'Delivery addresses and notes on your past orders',
  'Orders you placed but never paid for',
];

export const KEPT_AFTER_DELETION = [
  'Receipts and payment records, for 7 years as Kenyan tax law requires, with your name, phone and addresses removed',
  'Reviews you wrote, shown without your name',
  'Support conversations, without your sign-in',
  'Messages you sent in trip groups and stay chats, shown as from a former member. Trip groups you run are closed',
  'Safety reports you sent, or that were sent about your messages',
];

export const DELETION_REQUEST_MAILTO = `mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent(
  'Delete my NexG account',
)}`;
