/* What /api/host-workspace/hiring sends (apps/web/lib/host-workspace/hiring.ts). */

export interface HiringEmployer {
  kind: 'host' | 'hotel';
  id: string;
  name: string;
  verified: boolean;
  cityId: string | null;
}

export interface HiringJob {
  id: string;
  employerKind: 'host' | 'hotel';
  employerId: string;
  employerName: string;
  title: string;
  category: string;
  jobType: string;
  status: 'draft' | 'open' | 'closed';
  cityId: string;
  area: string | null;
  openings: number;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: string | null;
  description: string;
  requirements: string | null;
  closesOn: string | null;
  postedAt: string | null;
  createdAt: string;
  takenDownReason: string | null;
  applicants: number;
  applicantsNew: number;
}

export interface HiringApplicant {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  note: string | null;
  cvName: string | null;
  status: string;
  employerNote: string | null;
  interviewAt: string | null;
  createdAt: string;
}

export interface HiringOverview {
  employers: HiringEmployer[];
  jobs: HiringJob[];
  cities: { id: string; name: string; timezone: string }[];
}

export interface HiringDetail {
  job: HiringJob;
  applicants: HiringApplicant[];
  timeZone: string;
}

export const JOB_CATEGORIES = [
  ['hospitality', 'Hospitality & Hotels'],
  ['food_beverage', 'Food & Beverage'],
  ['property', 'Property Management'],
  ['tourism_travel', 'Tourism & Travel'],
  ['logistics', 'Logistics & Operations'],
  ['maintenance', 'Maintenance & Technical'],
  ['cleaning', 'Cleaning & Housekeeping'],
  ['office_admin', 'Office & Admin'],
  ['retail', 'Retail & Sales'],
  ['beauty_wellness', 'Beauty & Wellness'],
  ['other', 'Other roles'],
] as const;

export const JOB_TYPES = [
  ['full_time', 'Full-time'],
  ['part_time', 'Part-time'],
  ['temporary', 'Temporary'],
  ['gig', 'Freelance / Gig'],
  ['internship', 'Internship'],
] as const;

export const PAY_PERIODS = [
  ['hour', 'Per hour'],
  ['day', 'Per day'],
  ['shift', 'Per shift'],
  ['week', 'Per week'],
  ['month', 'Per month'],
] as const;
