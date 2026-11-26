import { FileSpreadsheet, FileText } from 'lucide-react';

import { DashCard } from '@/components/portal/dash';
import { Chip, DataTable, Footnote } from '@/components/stays/module';
import {
  SavedControls,
  SavedForm,
  ScheduleControls,
  ScheduleForm,
} from '@/components/stays/report-plans';
import type { Period } from '@/lib/portal';
import { REPORTS, shortDate, staysHref, when } from '@/lib/stays-module';
import { savedPeriodDates, savedPeriodLabel, type Plans } from '@/lib/stays-report-plans';

/*
 * Stays › Reports › Scheduled Reports and Saved Reports, from
 * rpc_console_stays_report_plans. Server-safe; the buttons are in
 * ./report-plans.
 */

const titleOf = (key: string) => REPORTS.find((r) => r.key === key)?.title ?? key;

function DownloadLinks({ href }: { href: (format: 'csv' | 'pdf') => string }) {
  const cls =
    'inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#F5D27A] bg-[#FFFBF0] px-2.5 text-[0.8125rem] font-bold text-[#8A5C00] hover:bg-[#FFF4D6]';
  return (
    <div className="flex flex-wrap gap-1.5">
      <a href={href('csv')} download className={cls}>
        <FileSpreadsheet aria-hidden="true" className="h-3.5 w-3.5" /> Run now (CSV)
      </a>
      <a href={href('pdf')} download className={cls}>
        <FileText aria-hidden="true" className="h-3.5 w-3.5" /> PDF
      </a>
    </div>
  );
}

export function ScheduledReportsView({
  plans,
  cities,
  city,
}: {
  plans: Plans;
  cities: { id: string; name: string }[];
  city: string | null;
}) {
  return (
    <DashCard
      title="Scheduled Reports"
      aside={<ScheduleForm cities={cities} people={plans.recipients} defaultCity={city} />}
    >
      <DataTable
        caption="Scheduled reports"
        isEmpty={plans.schedules.length === 0}
        empty="No scheduled reports yet. Schedule one to email it to staff every week or month."
        head={[
          'Report',
          'City',
          'Every',
          'Sent To',
          'Next Email',
          'Last Sent',
          'Status',
          'Added By',
          '',
        ]}
      >
        {plans.schedules.map((s) => (
          <tr key={s.id}>
            <td className="font-semibold">{titleOf(s.report)}</td>
            <td>{s.city_name ?? 'All cities'}</td>
            <td>{s.frequency === 'weekly' ? 'Week (Mon)' : 'Month (1st)'}</td>
            <td className="max-w-[16rem]">
              {s.recipients
                .map((r) => r.name + (r.active === false ? ' (inactive)' : ''))
                .join(', ') || '—'}
            </td>
            <td className="whitespace-nowrap">{s.active ? when(s.next_run_at) : '—'}</td>
            <td className="whitespace-nowrap">
              {s.last_sent_at ? when(s.last_sent_at) : 'Not yet'}
            </td>
            <td>
              <Chip status={s.active ? 'active' : 'paused'} />
              {s.last_error && (
                <p className="mt-1 text-xs font-semibold text-[#C62D22]">
                  Last try failed: {s.last_error}
                </p>
              )}
            </td>
            <td>{s.created_by_name ?? '—'}</td>
            <td>
              {s.can_change ? (
                <div className="flex flex-wrap gap-1.5">
                  <ScheduleForm cities={cities} people={plans.recipients} schedule={s} />
                  <ScheduleControls schedule={s} />
                </div>
              ) : (
                <span className="text-muted text-[0.8125rem]">Hospitality staff or the owner</span>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      <Footnote>
        Sent at 05:00 Nairobi time: weekly on Mondays for the week before, monthly on the 1st for
        the month before. The email has the bookings and booking value and a link to download the
        report from the console; each send shows in Exports & History.
      </Footnote>
    </DashCard>
  );
}

export function SavedReportsView({
  plans,
  cities,
  period,
  city,
  today,
}: {
  plans: Plans;
  cities: { id: string; name: string }[];
  period: Period;
  city: string | null;
  today: string;
}) {
  return (
    <DashCard
      title="Saved Reports"
      aside={
        <SavedForm cities={cities} defaults={{ cityId: city, from: period.from, to: period.to }} />
      }
    >
      <DataTable
        caption="Saved reports"
        isEmpty={plans.saved.length === 0}
        empty="No saved reports yet. Save a report's city and period to run it again in one click."
        head={['Name', 'Report', 'City', 'Period', 'Owner', 'Run', '']}
      >
        {plans.saved.map((s) => {
          const dates = savedPeriodDates(s.period, today, s.from_date, s.to_date);
          return (
            <tr key={s.id}>
              <td className="font-semibold">{s.name}</td>
              <td>{titleOf(s.report)}</td>
              <td>{s.city_name ?? 'All cities'}</td>
              <td>
                {savedPeriodLabel(s)}
                <span className="text-muted block text-xs">
                  {shortDate(dates.from)} – {shortDate(dates.to)}
                </span>
              </td>
              <td>
                {s.mine ? 'You' : (s.owner_name ?? '—')}
                {s.shared && <span className="text-muted block text-xs">Shared</span>}
              </td>
              <td>
                <DownloadLinks
                  href={(format) =>
                    staysHref('/stays/export', dates, s.city_id, {
                      report: s.report,
                      format: format === 'pdf' ? 'pdf' : null,
                    })
                  }
                />
              </td>
              <td>
                {s.can_change && (
                  <div className="flex flex-wrap gap-1.5">
                    <SavedForm
                      cities={cities}
                      saved={s}
                      defaults={{ cityId: city, from: period.from, to: period.to }}
                    />
                    <SavedControls id={s.id} />
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </DataTable>
      <Footnote>
        A preset period (this month, last 7 days…) is worked out on the day you run it. Your saved
        reports are yours unless you share them; each run is logged in Exports & History.
      </Footnote>
    </DashCard>
  );
}
