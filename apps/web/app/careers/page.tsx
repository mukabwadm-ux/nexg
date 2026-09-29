import { Button, VALUE_PLACEHOLDER } from '@nexg/ui';
import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { RoleList } from '@/components/careers/role-list';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { BENEFITS, HIRING_STEPS, PRINCIPLES, ROLES, TEAMS } from '@/content/careers';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata: Metadata = {
  title: 'Careers',
  description: 'Help us build the front desk of East Africa. Roles in Nairobi and remote.',
};

/*
 * Cached and re-rendered at most once an hour. Everything on this page is the
 * same for every visitor, so re-querying it per request bought nothing and
 * cost a round trip to the database on each one.
 */
export const revalidate = 3600;

export default async function CareersPage() {
  const supabase = createPublicClient();
  const { count: cityCount } = await supabase
    .from('city')
    .select('id', { count: 'exact', head: true });

  return (
    <>
      <SiteHeader action={{ label: 'See open roles', href: '#roles' }} />

      <main>
        {/* ------------------------------------------------------------ hero */}
        <section className="mx-auto max-w-[96rem] px-4 pb-12 pt-8 sm:px-8 lg:px-16 lg:pb-16">
          <div className="grid gap-10 lg:grid-cols-[1fr_30rem] lg:items-center">
            <div>
              <span className="border-border-strong bg-surface inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold">
                <span aria-hidden="true" className="bg-gold h-1.5 w-1.5 rounded-full" />
                Careers at NexG · Nairobi and remote across East Africa
              </span>

              <h1 className="mt-5 text-4xl/[1.08] font-extrabold tracking-tight sm:text-5xl/[1.08] lg:text-[3.5rem]/[1.08]">
                Help us build the <span className="text-gold">front desk</span> of East Africa.
              </h1>

              <p className="text-muted mt-5 max-w-xl text-[1.0625rem] font-semibold leading-[1.7]">
                NexG puts a concierge in every guest’s pocket — food, laundry, transfers, anything —
                delivered by local merchants and riders. We’re a small team with a big operating
                problem to solve, and we’re hiring people who like it that way.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Button size="lg" asChild>
                  <Link href="#roles">See open roles</Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link href="#how-we-hire">How we hire</Link>
                </Button>
              </div>

              <dl className="mt-9 flex flex-wrap gap-y-4">
                {[
                  { value: String(ROLES.length), label: 'Open roles' },
                  { value: cityCount ?? VALUE_PLACEHOLDER, label: 'Cities we operate in' },
                  { value: '24/7', label: 'Concierge desk hours' },
                ].map((stat, index) => (
                  <div
                    key={stat.label}
                    className={
                      index === 0 ? 'pr-10' : 'border-border-strong border-l pl-10 pr-10 last:pr-0'
                    }
                  >
                    <dt className="sr-only">{stat.label}</dt>
                    <dd>
                      <span className="block text-2xl font-extrabold tracking-tight">
                        {stat.value}
                      </span>
                      <span className="text-muted-light block text-xs font-semibold">
                        {stat.label}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Decorative: what a night shift actually looks like. */}
            <div aria-hidden="true" className="bg-ink overflow-hidden rounded-2xl p-5 text-white">
              <div className="bg-surface text-ink flex items-center justify-between gap-3 rounded-xl p-3">
                <span className="flex items-center gap-2">
                  <span className="bg-ink text-gold flex h-8 w-8 items-center justify-center rounded-full text-[0.625rem] font-extrabold">
                    DC
                  </span>
                  <span>
                    <span className="block text-[0.8125rem] font-extrabold">
                      Concierge desk · Night shift
                    </span>
                    <span className="text-muted-light block text-[0.6875rem] font-semibold">
                      {VALUE_PLACEHOLDER} live requests · avg reply {VALUE_PLACEHOLDER}s
                    </span>
                  </span>
                </span>
                <span className="bg-success-bg text-success rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold uppercase tracking-wide">
                  On shift
                </span>
              </div>

              <div className="bg-gold text-ink mt-3 rounded-xl p-4">
                <p className="text-[0.5625rem] font-extrabold uppercase tracking-[0.16em]">
                  What the work feels like
                </p>
                <p className="mt-2 text-[0.9375rem] font-bold leading-[1.6]">
                  A guest lands at 11pm needing a charger, dinner and a pressed shirt by 7am. We
                  make that happen — then make it happen faster next time.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ principles */}
        <section className="border-border bg-surface border-y py-14">
          <div className="mx-auto max-w-[96rem] px-4 sm:px-8 lg:px-16">
            <p className="text-gold-text text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
              How we work
            </p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <h2 className="max-w-lg text-3xl font-extrabold tracking-tight sm:text-4xl">
                Four things we won’t compromise on.
              </h2>
              <p className="text-muted-light max-w-sm text-xs font-semibold leading-[1.7]">
                If these sound like how you already work, you’ll fit. If they sound like slogans,
                we’d rather you didn’t apply.
              </p>
            </div>

            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PRINCIPLES.map((principle) => (
                <li
                  key={principle.number}
                  className="border-border bg-bg/60 rounded-2xl border p-5"
                >
                  <span className="text-gold-text text-[0.625rem] font-extrabold">
                    {principle.number}
                  </span>
                  <h3 className="mt-2 text-[1.0625rem] font-extrabold">{principle.title}</h3>
                  <p className="text-muted mt-2 text-[0.8125rem] font-semibold leading-[1.7]">
                    {principle.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ----------------------------------------------------------- roles */}
        <section
          id="roles"
          className="mx-auto max-w-[96rem] scroll-mt-4 px-4 py-14 sm:px-8 lg:px-16"
        >
          <div className="border-border bg-surface rounded-2xl border p-6 sm:p-8">
            <p className="text-gold-text text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
              Open roles
            </p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                Where you could fit.
              </h2>
              {/* The artboard says this and it stays true until a hiring
                  manager confirms each one. */}
              <p className="text-muted-light text-xs font-semibold">
                Listings below are placeholders until roles are confirmed.
              </p>
            </div>

            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {TEAMS.map((team) => (
                <li key={team.key} className="border-border bg-bg/60 rounded-xl border p-4">
                  <h3 className="text-[0.875rem] font-extrabold">{team.name}</h3>
                  <p className="text-muted-light mt-1.5 text-xs font-semibold leading-[1.7]">
                    {team.blurb}
                  </p>
                </li>
              ))}
            </ul>

            <RoleList />
          </div>
        </section>

        {/* --------------------------------------------------- how we hire */}
        <section
          id="how-we-hire"
          className="mx-auto max-w-[96rem] scroll-mt-4 px-4 pb-14 sm:px-8 lg:px-16"
        >
          <div className="grid gap-8 lg:grid-cols-[1fr_24rem] lg:items-start">
            <div>
              <p className="text-gold-text text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
                How we hire
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                Five steps, about two weeks.
              </h2>
              <p className="text-muted mt-2 text-[0.9375rem] font-semibold leading-[1.7]">
                We tell you where you stand at every step. If it’s a no, you’ll hear it from a
                person, with a reason.
              </p>

              <ol className="mt-7 space-y-3">
                {HIRING_STEPS.map((step, index) => (
                  <li
                    key={step.title}
                    className="border-border bg-surface flex gap-4 rounded-xl border p-4"
                  >
                    <span
                      aria-hidden="true"
                      className="bg-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-[0.9375rem] font-extrabold">{step.title}</span>
                        <span className="text-gold-text text-xs font-bold">{step.duration}</span>
                      </span>
                      <span className="text-muted mt-1 block text-[0.8125rem] font-semibold leading-[1.7]">
                        {step.body}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="bg-ink rounded-2xl p-6 text-white">
              <p className="text-gold text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
                What you get
              </p>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight">
                Looked after, so you can look after guests.
              </h2>
              <ul className="mt-5 space-y-3">
                {BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className="bg-gold text-ink mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                    >
                      <Check className="h-3 w-3" />
                    </span>
                    <span className="text-[0.8125rem] font-semibold leading-snug">{benefit}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-[0.6875rem] font-semibold leading-[1.6] text-white/40">
                Benefits vary by role, contract type and country. Details are in every offer letter.
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- not a job ad */}
        <section className="mx-auto max-w-[96rem] px-4 pb-14 sm:px-8 lg:px-16">
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                eyebrow: 'Not a job listing',
                title: 'Want to ride with NexG?',
                body: 'Riders join as independent partners with flexible hours and weekly payouts — not through this page.',
                cta: 'Become a Rider',
                href: '/riders',
              },
              {
                eyebrow: 'Not a job listing',
                title: 'Run a shop or kitchen?',
                body: 'Merchants list on NexG and get orders from guests across the city. Registration takes ten minutes.',
                cta: 'Register Your Business',
                href: '/merchants',
              },
            ].map((card) => (
              <div
                key={card.href}
                className="border-border bg-surface flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5"
              >
                <span className="min-w-0">
                  <span className="text-muted-light block text-[0.5625rem] font-extrabold uppercase tracking-[0.16em]">
                    {card.eyebrow}
                  </span>
                  <span className="mt-1 block text-[1.0625rem] font-extrabold">{card.title}</span>
                  <span className="text-muted mt-1 block max-w-sm text-xs font-semibold leading-[1.7]">
                    {card.body}
                  </span>
                </span>
                <Button size="sm" asChild>
                  <Link href={card.href}>{card.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------- CTA */}
        <section className="mx-auto max-w-[96rem] px-4 pb-14 sm:px-8 lg:px-16">
          <div className="bg-gold text-ink flex flex-wrap items-center justify-between gap-6 rounded-2xl p-8 sm:p-12">
            <div className="max-w-lg">
              <h2 className="text-[2rem] font-extrabold leading-tight tracking-tight">
                Come build the thing guests will take for granted.
              </h2>
              <p className="text-ink/80 mt-3 text-[0.9375rem] font-semibold">
                Questions before you apply? Ask us and a human will reply within two working days.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="black" size="lg" asChild className="h-14 shrink-0 rounded-xl">
                <Link href="#roles">See open roles</Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                asChild
                className="border-ink text-ink h-14 shrink-0 rounded-xl"
              >
                <Link href="/help">Ask a question</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
