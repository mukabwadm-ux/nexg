import { DASH, when } from '@/components/host/bits';
import { HowItWorks, Pill, Table, Td, Tr, TwoColumn } from '@/components/host/module';
import {
  Settings,
  type SettingsRow,
  type ThemeRow,
} from '@/components/host/settings-client';
import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

interface TeamRow {
  user_id: string;
  role: string;
  units: string[] | null;
  accepted_at: string | null;
  created_at: string;
}

/** Masked the same way a guest phone is, for the same reason. */
function maskPhone(p: string | null): string {
  if (!p) return DASH;
  if (p.length <= 6) return '•••';
  return `${p.slice(0, 4)}${'•'.repeat(Math.max(0, p.length - 7))}${p.slice(-2)}`;
}

/**
 * Settings.
 *
 * The parts a host can change are a form; the parts only host
 * ops can change are shown with the reason, not as a greyed-out
 * input. A disabled field is an invitation to click it and
 * conclude something is broken.
 */
export default async function HostSettingsPage() {
  const { home, live, nav, supabase, me, photoUrl } = await hostContext();
  if (!home) return null;

  const [setRes, themeRes, teamRes, phoneRes, userRes] = await Promise.all([
    supabase.from('host_settings_v').select('*').eq('host_id', me.id).maybeSingle(),
    supabase.from('user_theme_v').select('*').maybeSingle(),
    supabase.from('host_user').select('*').eq('host_id', me.id).order('created_at'),
    supabase.from('host').select('phone').eq('id', me.id).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  const settings = setRes.data as SettingsRow | null;
  const theme = themeRes.data as ThemeRow | null;
  const team = (teamRes.data as TeamRow[] | null) ?? [];
  const phone = (phoneRes.data as { phone: string | null } | null)?.phone ?? null;
  const myUserId = userRes.data.user?.id ?? null;
  const pending = team.filter((t) => t.accepted_at === null);

  const featuresOn = Object.values(settings?.features ?? {}).filter(Boolean).length;

  if (!settings) return null;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      photoUrl={photoUrl}
      current="/host/settings"
      title="Settings"
      lead="Turn things on and off, choose how you are notified, brand what your guests see, and make the portal look the way you like."
      headlineValue={String(featuresOn)}
      headlineNote={featuresOn === 1 ? 'Feature on' : 'Features on'}
    >
      <Settings
        settings={settings}
        theme={theme}
        phoneMasked={maskPhone(phone)}
        devices={[
          { label: 'This session', seen: 'Now', current: true },
          ...(team.length > 1
            ? [{ label: `${team.length - 1} other team sign-in(s)`, seen: 'See Team', current: false }]
            : []),
        ]}
      />

      <TwoColumn
        rail={
          <>
            <HowItWorks title="Why your phone is read-only">
              It is the number we verified you on and the one a rider calls. Changing it is a
              staff action with a reason recorded against it, because a quiet change here is
              indistinguishable from an account takeover.
            </HowItWorks>

            <HowItWorks title="Appearance is yours alone">
              Stored against your login, not your business. Two managers of the same property can
              want different themes, and a theme on the host would have one of them overwrite the
              other every time they saved.
            </HowItWorks>

            <HowItWorks title="Leaving">
              Ask host ops to close the account and your units stop accepting orders the same
              day. Orders already placed finish; cards already in rooms stop working. Records we
              have to keep for tax stay, with you detached.
            </HowItWorks>
          </>
        }
      >
        <Table
          head={['Member', 'Role', 'Scope', 'Joined']}
          empty="Nobody but you."
          caption="A manager scoped to some units sees only those units everywhere — bookings, deliveries, requests and analytics. Scope is a database rule, not a filter on a page."
        >
          {team.map((t) => (
            <Tr key={t.user_id} tone={t.accepted_at === null ? 'warn' : 'plain'}>
              <Td strong note={t.user_id === myUserId ? 'you' : undefined}>
                {t.user_id === myUserId ? (settings.contact_name ?? 'You') : 'Team member'}
              </Td>
              <Td>
                {t.role === 'owner' ? (
                  <Pill tone="gold">Owner</Pill>
                ) : (
                  <Pill tone="info">Manager</Pill>
                )}
              </Td>
              <Td muted>
                {t.units === null
                  ? 'Every unit'
                  : `${t.units.length} unit${t.units.length === 1 ? '' : 's'}`}
              </Td>
              <Td muted>
                {t.accepted_at ? when(t.accepted_at) : <Pill tone="warn">Invite pending</Pill>}
              </Td>
            </Tr>
          ))}
        </Table>

        {pending.length > 0 ? (
          <div className="border-gold/40 bg-gold-soft rounded-xl border p-4">
            <p className="text-[0.875rem] font-extrabold">
              {pending.length} invitation{pending.length === 1 ? '' : 's'} not yet accepted
            </p>
            <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.65]">
              An invitation grants nothing until it is accepted. Until then that person cannot
              sign in and sees none of your units.
            </p>
          </div>
        ) : null}
      </TwoColumn>
    </HostSection>
  );
}
