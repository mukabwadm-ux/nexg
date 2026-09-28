/**
 * Careers content, from the signed-off `Careers` artboard.
 *
 * The artboard says it plainly above the list and so does the page: these
 * roles are placeholders until they are confirmed. They are kept here rather
 * than in the database because a job listing is editorial copy that should go
 * through review, not a row someone edits at midnight.
 */

export interface Role {
  title: string;
  team: TeamKey;
  location: string;
  commitment: string;
}

export type TeamKey = 'concierge' | 'technology' | 'growth' | 'launch';

export const TEAMS: { key: TeamKey; name: string; blurb: string }[] = [
  {
    key: 'concierge',
    name: 'Concierge & Operations',
    blurb:
      'The desk that answers guests, the dispatchers who route riders, and the city leads who keep supply healthy.',
  },
  {
    key: 'technology',
    name: 'Technology',
    blurb:
      'Guest app, rider app, merchant dashboard and the dispatch engine underneath — small team, full ownership.',
  },
  {
    key: 'growth',
    name: 'Growth & Partnerships',
    blurb:
      'Hotels, serviced apartments, merchants and featured placements. Relationships first, dashboards second.',
  },
  {
    key: 'launch',
    name: 'City Launch',
    blurb:
      'Open the next city: recruit riders and merchants, sign the first hotels, run the first hundred orders yourself.',
  },
];

export const PRINCIPLES = [
  {
    number: '01',
    title: 'Guests first, always',
    body: 'Every decision starts with the person waiting in a hotel room. If it’s slower or more confusing for them, it’s wrong.',
  },
  {
    number: '02',
    title: 'Partners are the product',
    body: 'Riders and merchants are not suppliers, they are NexG. We pay on time, answer the phone, and design their tools with them.',
  },
  {
    number: '03',
    title: 'Say the real number',
    body: 'No invented stats, no vanity metrics. We show live tracking to guests and real earnings to riders because trust is the business.',
  },
  {
    number: '04',
    title: 'Own the city',
    body: 'Each city has a small team that knows its hotels, streets and merchants by name. Local judgement beats a central playbook.',
  },
] as const;

export const ROLES: Role[] = [
  {
    title: 'Concierge Agent (Night Shift)',
    team: 'concierge',
    location: 'Nairobi',
    commitment: 'Shifts · Full-time',
  },
  {
    title: 'Dispatch & Rider Operations Lead',
    team: 'concierge',
    location: 'Nairobi',
    commitment: 'On-site · Full-time',
  },
  {
    title: 'City Operations Manager',
    team: 'concierge',
    location: 'Mombasa',
    commitment: 'On-site · Full-time',
  },
  {
    title: 'Senior Full-stack Engineer (Next.js / Supabase)',
    team: 'technology',
    location: 'Nairobi or Remote (EAT)',
    commitment: 'Full-time',
  },
  {
    title: 'Mobile Engineer — Rider App',
    team: 'technology',
    location: 'Remote (EAT ±2h)',
    commitment: 'Full-time',
  },
  {
    title: 'Product Designer',
    team: 'technology',
    location: 'Nairobi or Remote',
    commitment: 'Full-time',
  },
  {
    title: 'Hotel Partnerships Manager',
    team: 'growth',
    location: 'Nairobi',
    commitment: 'Hybrid · Full-time',
  },
  {
    title: 'Merchant Success Associate',
    team: 'growth',
    location: 'Nairobi',
    commitment: 'Hybrid · Full-time',
  },
  {
    title: 'City Launcher',
    team: 'launch',
    location: 'Kampala',
    commitment: 'On-site · 6-month contract',
  },
];

export const HIRING_STEPS = [
  {
    title: 'Apply',
    body: 'A short form and your CV or LinkedIn. No cover letter needed — tell us in three lines why this role.',
    duration: '2 min',
  },
  {
    title: 'Intro call',
    body: 'Thirty minutes with the hiring manager about the role, the city and what you’d own in your first 90 days.',
    duration: '30 min',
  },
  {
    title: 'Work sample',
    body: 'A real, scoped problem from the job — a dispatch scenario, a partner pitch or a small design. Paid for anything over two hours.',
    duration: '2–4 hrs',
  },
  {
    title: 'Team conversation',
    body: 'Meet two people you’d work with daily. You interview us as much as we interview you.',
    duration: '45 min',
  },
  {
    title: 'Offer',
    body: 'A written offer with salary, equity where applicable and start date. We move within a week of the final conversation.',
    duration: '≤ 1 wk',
  },
] as const;

export const BENEFITS = [
  'Competitive salary paid on time, every month',
  'Medical cover for you and your dependants',
  'Equity for early team members',
  'Phone and data allowance — the job runs on it',
  'Learning budget and paid certifications',
  'Free NexG deliveries while on shift',
  'Flexible hours outside desk shifts',
  'Relocation support for city launches',
] as const;
