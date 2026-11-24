import { Tabs } from '../ui';

/* The Inbox holds two kinds of chat: with NexG support (#inbox) and with guests (#inbox/guests). */
export function InboxTabs({ value }: { value: 'NexG support' | 'Guests' }) {
  return (
    <Tabs
      items={['NexG support', 'Guests']}
      value={value}
      onChange={(next) => {
        if (next === value) return;
        window.location.hash = next === 'Guests' ? 'inbox/guests' : 'inbox';
      }}
    />
  );
}
