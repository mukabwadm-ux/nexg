import 'server-only';

import { z } from 'zod';

import {
  BOOKING_SOURCES,
  CALENDAR_PROVIDERS,
  HANDOFFS,
  HOST_REQUEST_STATUSES,
  HOST_REQUEST_TYPES,
  KINDS,
  SPOTS,
} from '@/lib/host-workspace/vocab';
import { EVENTS, FEATURES, ROLES } from '@/lib/host-workspace/settings-vocab';
import { dateKey } from '../../../../hosts-workspace/src/model';
import { HostWorkspaceError, type HostWorkspaceAccess } from './access';
import { validZone } from './read';
import { saveWorkspaceTask } from './tasks';
import { runGuideCommand } from './guides';

const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(160);
const note = z.string().trim().max(4000);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const day = z.string().date();
const positiveInt = z.number().int().positive().max(1_000_000);
const scopeError = () =>
  new HostWorkspaceError(403, 'This record is outside your workspace access.');
const invalid = (message: string) => new HostWorkspaceError(400, message);

function checked(result: { error: { code: string; message: string } | null }, message: string) {
  const { error } = result;
  if (!error) return { message };
  if (error.code === '42501') throw scopeError();
  if (['22023', '23505'].includes(error.code)) throw invalid(error.message);
  throw new HostWorkspaceError(503, 'Saving could not be confirmed. Refresh before trying again.');
}

async function requireUnit(access: HostWorkspaceAccess, id: string) {
  if (access.unitScope && !access.unitScope.includes(id)) throw scopeError();
  const { data, error } = await access.db
    .from('host_unit_list_v')
    .select('id')
    .eq('host_id', access.hostId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new HostWorkspaceError(503, 'The unit could not be checked.');
  if (!data) throw scopeError();
}

async function saveReservation(
  access: HostWorkspaceAccess,
  id: string | undefined,
  input: unknown,
) {
  const booking = z
    .object({
      unitId: uuid,
      guest: name,
      start: day,
      end: day,
      arrivalTime: time,
      departTime: time,
      adults: positiveInt.max(100),
      children: z.number().int().min(0).max(100),
      rateKes: positiveInt.optional(),
      phone: z.string().max(50).optional(),
      source: z
        .string()
        .refine((value) => BOOKING_SOURCES.some((source) => source.value === value))
        .optional(),
    })
    .parse(input);
  await requireUnit(access, booking.unitId);
  const { db, hostId, unitScope } = access;
  const { data: settings, error } = await db
    .from('host_settings_v')
    .select('time_zone')
    .eq('host_id', hostId)
    .maybeSingle();
  if (error) throw new HostWorkspaceError(503, 'The workspace time zone could not be checked.');
  const zone = validZone(settings?.time_zone);
  let source = booking.source ?? 'entered';
  let checkIn = booking.start + ' ' + booking.arrivalTime + ':00 ' + zone;
  let checkOut = booking.end + ' ' + booking.departTime + ':00 ' + zone;
  if (id) {
    const existing = await db
      .from('host_stay_v')
      .select('unit_id, status, source, check_in, check_out')
      .eq('id', id)
      .eq('host_id', hostId)
      .maybeSingle();
    if (existing.error) throw new HostWorkspaceError(503, 'The reservation could not be checked.');
    const row = existing.data;
    if (!row?.unit_id || (unitScope && !unitScope.includes(row.unit_id)) || row.status !== 'booked')
      throw scopeError();
    source = booking.source ?? row.source ?? 'entered';
    const clock = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
    });
    const unchanged = (original: string | null, date: string, hhmm: string) =>
      original &&
      dateKey(new Date(original), zone) === date &&
      clock.format(new Date(original)) === hhmm;
    if (row.check_in && unchanged(row.check_in, booking.start, booking.arrivalTime))
      checkIn = row.check_in;
    if (row.check_out && unchanged(row.check_out, booking.end, booking.departTime))
      checkOut = row.check_out;
  }

  const result = await db.rpc('rpc_stay_upsert', {
    p_host_id: hostId,
    p_stay_id: id,
    p_stay: {
      unit_id: booking.unitId,
      guest_first_name: booking.guest,
      check_in: checkIn,
      check_out: checkOut,
      party_adults: booking.adults,
      party_children: booking.children,
      rate_kes: booking.rateKes,
      source,
      phone: booking.phone,
    },
  });
  return checked(
    result,
    result.data?.conflict_flagged
      ? 'Reservation saved. It overlaps another reservation for this unit.'
      : 'Reservation saved.',
  );
}

function isLogo(value: string) {
  if (value === '') return true;
  const match = /^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(value);
  if (!match?.[2]) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 256 * 1024 || bytes.toString('base64') !== match[2]) return false;
  if (match[1] === 'png')
    return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (match[1] === 'jpeg') return bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

const settingsPatch = z
  .object({
    workspace: name,
    business: z.string().trim().max(120),
    email: z.string().trim().email().max(254),
    timezone: z
      .string()
      .max(80)
      .refine((zone) => {
        try {
          new Intl.DateTimeFormat('en-GB', { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      }),
    language: z.enum(['en', 'sw']),
    checkIn: time,
    checkOut: time,
    signature: z.string().trim().max(200),
    bookings: z.boolean(),
    daily: z.boolean(),
    tasks: z.boolean(),
    guestBrand: z.string().trim().max(120),
    logo: z.string().max(350_000).refine(isLogo),
    landingHeadline: z.string().trim().min(1).max(160),
    landingColour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    billingPreference: z.enum(['Manual record', 'M-Pesa preference', 'Card preference']),
    quietHours: z.object({ from: time, to: time }),
    notificationRules: z.record(
      z.string().refine((key) => EVENTS.some((event) => event.key === key)),
      z.array(z.enum(ROLES)).max(ROLES.length),
    ),
    features: z.record(
      z
        .string()
        .refine(
          (key) => key !== 'charge_to_room' && FEATURES.some((feature) => feature.key === key),
        ),
      z.boolean(),
    ),
  })
  .partial()
  .strict();

const commandSchema = z.object({
  type: z.enum([
    'save',
    'delete',
    'transition',
    'settings',
    'theme',
    'referral',
    'sign-out-others',
    'publish',
    'restore',
    'unpublish',
    'remove-guide-file',
  ]),
  collection: z.string().optional(),
  id: uuid.optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
  record: z.unknown(),
  settings: z.unknown(),
  status: z.string().optional(),
});

export async function runHostCommand(access: HostWorkspaceAccess, input: unknown) {
  const command = commandSchema.parse(input);
  const { db, hostId, unitScope, role } = access;
  const { collection, id, record, status } = command;

  if (
    (collection === 'articles' && (command.type === 'save' || command.type === 'delete')) ||
    (collection === 'units' &&
      ['publish', 'restore', 'unpublish', 'remove-guide-file'].includes(command.type))
  ) {
    return runGuideCommand(access, command);
  }

  if (command.type === 'settings') {
    if (role !== 'Owner' || unitScope) throw scopeError();
    const {
      workspace,
      email,
      timezone,
      language,
      landingHeadline,
      landingColour,
      quietHours,
      notificationRules,
      features,
      ...profile
    } = settingsPatch.parse(command.settings);
    return checked(
      await db.rpc('rpc_host_workspace_profile_save', {
        p_host_id: hostId,
        p_host_patch: {
          display_name: workspace,
          email,
          time_zone: timezone,
          language,
          landing_headline: landingHeadline,
          landing_brand_colour: landingColour,
          quiet_hours: quietHours,
          notification_rules: notificationRules,
          features,
        },
        p_profile_patch: profile,
      }),
      'Workspace settings saved.',
    );
  }

  if (command.type === 'theme') {
    const theme = z
      .object({
        theme: z.enum(['nexg', 'light', 'dark', 'contrast', 'custom']),
        accent: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .nullable(),
        sidebar: z.enum(['light', 'dark']),
        density: z.enum(['comfortable', 'compact']),
        font_size: z.enum(['default', 'large']),
      })
      .parse(record);
    return checked(
      await db.rpc('rpc_user_theme_set', { p_theme: theme }),
      'Your appearance was saved.',
    );
  }

  if (command.type === 'referral') {
    if (role !== 'Owner' || unitScope) throw scopeError();
    return checked(
      await db.rpc('rpc_host_referral_link', { p_host_id: hostId }),
      'Your referral link is ready.',
    );
  }

  if (command.type === 'sign-out-others') {
    const { error } = await db.auth.signOut({ scope: 'others' });
    if (error) throw new HostWorkspaceError(503, 'Other sessions could not be signed out.');
    return { message: 'Other sessions were signed out.' };
  }

  if (command.type === 'save' && (collection === 'payments' || collection === 'expenses') && !id) {
    const common = z.object({
      operationId: uuid,
      amountMinor: z.number().int().min(1).max(10_000_000_000),
      date: day,
    });
    const payment =
      collection === 'payments'
        ? common
            .extend({
              stayId: uuid,
              type: z.enum(['Receipt', 'Refund', 'Deposit', 'Deposit refund']),
              status: z.enum(['Recorded', 'Pending', 'Failed']),
              reference: z.string().trim().min(1).max(100),
            })
            .parse(record)
        : null;
    const expense = payment
      ? null
      : common
          .extend({
            unitId: uuid,
            description: z.string().trim().min(1).max(240),
            category: z.enum(['Cleaning', 'Maintenance', 'Utilities', 'Supplies', 'Other']),
            status: z.enum(['Recorded', 'Due']),
          })
          .parse(record);
    const entry = payment ?? expense!;
    return checked(
      await db.rpc('rpc_host_manual_finance_record', {
        p_host_id: hostId,
        p_entry: {
          id: entry.operationId,
          recorded_on: entry.date,
          amount_minor: entry.amountMinor,
          status: entry.status,
          kind: payment?.type ?? 'Expense',
          stay_id: payment?.stayId,
          reference: payment?.reference,
          unit_id: expense?.unitId,
          description: expense?.description,
          category: expense?.category,
        },
      }),
      payment ? 'Payment record saved.' : 'Expense recorded.',
    );
  }

  if (command.type === 'save' && collection === 'properties') {
    if (unitScope) throw scopeError();
    const property = z
      .object({
        name,
        area: name,
        description: note.optional(),
        floors: z.number().int().min(0).max(200).optional(),
        summary: z.string().max(2000).optional(),
        checkInFrom: time.optional(),
        checkOutBy: time.optional(),
        kind: z.string().refine((kind) => KINDS.some((item) => item.value === kind)),
      })
      .parse(record);
    return checked(
      await db.rpc('rpc_property_upsert', {
        p_host_id: hostId,
        p_property_id: id,
        p_property: {
          name: property.name,
          area: property.area,
          description: property.description,
          kind: property.kind,
          floors: property.floors,
          summary: property.summary,
          check_in_from: property.checkInFrom,
          check_out_by: property.checkOutBy,
        },
      }),
      'Property saved.',
    );
  }

  if (command.type === 'delete' && collection === 'properties' && id) {
    if (unitScope) throw scopeError();
    const { confirmName } = z.object({ confirmName: name }).parse(record);
    const { data, error } = await db
      .from('property')
      .select('id')
      .eq('host_id', hostId)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new HostWorkspaceError(503, 'The property could not be checked.');
    if (!data) throw scopeError();
    return checked(
      await db.rpc('rpc_property_delete', { p_property_id: id, p_confirm_name: confirmName }),
      'Property removed.',
    );
  }

  if (command.type === 'save' && collection === 'units') {
    if (unitScope && (!id || !unitScope.includes(id))) throw scopeError();
    const unit = z
      .object({
        name,
        propertyId: uuid.optional(),
        capacity: positiveInt.max(100).optional(),
        bedrooms: z.number().int().min(0).max(100).optional(),
        bathrooms: z.number().min(0).max(100).optional(),
        rateKes: positiveInt.optional(),
        labelPublic: z.string().max(160).optional(),
        floor: z.string().max(40).optional(),
        addressLine: z.string().max(240).optional(),
        building: z.string().max(120).optional(),
        unitNumber: z.string().max(40).optional(),
        contact: z.string().max(160).optional(),
        handoff: z
          .string()
          .refine((value) => HANDOFFS.some((rule) => rule.value === value))
          .optional(),
        handoffNote: z.string().max(240).optional(),
        deliveryFrom: time.optional(),
        deliveryTo: time.optional(),
        checkInFrom: time.optional(),
        checkOutBy: time.optional(),
      })
      .parse(record);
    if (!id && !unit.propertyId) throw invalid('Choose a property for the unit.');
    if (Boolean(unit.deliveryFrom) !== Boolean(unit.deliveryTo))
      throw invalid('Enter both delivery hours.');
    return checked(
      await db.rpc('rpc_unit_upsert_guarded', {
        p_host_id: hostId,
        p_unit_id: id,
        p_unit: {
          name: unit.name,
          property_id: unitScope ? undefined : unit.propertyId,
          max_guests: unit.capacity,
          bedrooms: unit.bedrooms,
          bathrooms: unit.bathrooms,
          nightly_rate_kes: unit.rateKes,
          label_public: unit.labelPublic,
          floor: unit.floor,
          address_line: unit.addressLine,
          building: unit.building,
          unit_no: unit.unitNumber,
          caretaker_name: unit.contact,
          handoff: unit.handoff,
          handoff_note: unit.handoffNote,
          checkin_time: unit.checkInFrom,
          checkout_time: unit.checkOutBy,
          delivery_hours:
            unit.deliveryFrom && unit.deliveryTo
              ? { from: unit.deliveryFrom, to: unit.deliveryTo }
              : undefined,
        },
      }),
      'Unit saved.',
    );
  }

  if (command.type === 'save' && collection === 'calendarConnections' && !id) {
    if (unitScope) throw scopeError();
    const input = z
      .object({
        provider: z
          .string()
          .refine((value) => CALENDAR_PROVIDERS.some((provider) => provider.value === value)),
        url: z
          .string()
          .trim()
          .url()
          .max(2048)
          .refine((value) => value.startsWith('https://'))
          .optional(),
        label: z.string().trim().max(160).optional(),
        propertyId: uuid.optional(),
      })
      .parse(record);
    if (input.provider !== 'pms_csv' && !input.url)
      throw invalid('Enter the HTTPS iCal feed link.');
    if (input.propertyId) {
      const { data, error } = await db
        .from('property')
        .select('id')
        .eq('host_id', hostId)
        .eq('id', input.propertyId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new HostWorkspaceError(503, 'The property could not be checked.');
      if (!data) throw scopeError();
    }
    return checked(
      await db.rpc('rpc_calendar_connect', {
        p_host_id: hostId,
        p_payload: {
          provider: input.provider,
          url: input.url,
          label: input.label,
          property_id: input.propertyId,
        },
      }),
      input.provider === 'pms_csv'
        ? 'PMS connection saved. Contact NexG to arrange the import.'
        : 'Calendar saved. Waiting for its first sync.',
    );
  }

  if (command.type === 'delete' && collection === 'calendarConnections' && id) {
    if (unitScope) throw scopeError();
    const { data, error } = await db
      .from('calendar_connection_v')
      .select('id')
      .eq('host_id', hostId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new HostWorkspaceError(503, 'The calendar could not be checked.');
    if (!data) throw scopeError();
    return checked(
      await db.rpc('rpc_calendar_remove', { p_connection_id: id }),
      'Calendar disconnected. Imported bookings remain in the workspace.',
    );
  }

  if (command.type === 'save' && collection === 'stays') return saveReservation(access, id, record);

  if (command.type === 'transition' && collection === 'stays' && id && status === 'Cancelled') {
    const { data, error } = await db
      .from('host_stay_v')
      .select('unit_id, status, source')
      .eq('host_id', hostId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new HostWorkspaceError(503, 'The reservation could not be checked.');
    if (!data?.unit_id || data.status === 'cancelled') throw scopeError();
    await requireUnit(access, data.unit_id);
    const { detail } = z.object({ detail: note.optional() }).parse(record ?? {});
    return checked(
      await db.rpc('rpc_stay_cancel', { p_stay_id: id, p_reason: detail }),
      'Reservation cancelled.',
    );
  }

  if (collection === 'packages' && (command.type === 'save' || command.type === 'delete')) {
    if (unitScope) throw scopeError();
    if (id) {
      const { data, error } = await db
        .from('welcome_package')
        .select('id')
        .eq('host_id', hostId)
        .eq('id', id)
        .is('archived_at', null)
        .maybeSingle();
      if (error) throw new HostWorkspaceError(503, 'The package could not be checked.');
      if (!data) throw scopeError();
    }
    if (command.type === 'delete' && id) {
      const result = await db.rpc('rpc_host_package_archive', { p_package_id: id });
      if (result.error?.code === '23503') throw invalid(result.error.message);
      return checked(result, 'Package archived.');
    }
    if (command.type !== 'save') throw invalid('Choose a package to archive.');
    const item = z
      .object({
        title: name,
        description: z.string().max(2000).optional(),
        items: z.string().trim().min(1).max(3000),
        leadHours: z.number().int().min(0).max(720),
        amountMinor: z.number().int().min(0).max(100_000_000).multipleOf(100),
      })
      .parse(record);
    return checked(
      await db.rpc('rpc_host_package_upsert', {
        p_host_id: hostId,
        p_package_id: id,
        p_package: {
          name: item.title,
          description: item.description,
          price: item.amountMinor / 100,
          lead_hours: item.leadHours,
          items: item.items
            .split(/\r?\n/)
            .map((value) => value.trim())
            .filter(Boolean),
        },
      }),
      'Package saved.',
    );
  }

  if (command.type === 'save' && collection === 'packageJobs' && !id) {
    const job = z.object({ unitId: uuid, packageId: uuid, due: z.string() }).parse(record);
    const [date, clock, rest] = job.due.split('T');
    if (rest || !day.safeParse(date).success || !time.safeParse(clock).success)
      throw invalid('Choose a valid check-in date and time.');
    await requireUnit(access, job.unitId);
    const [pack, host] = await Promise.all([
      db
        .from('welcome_package')
        .select('host_id,city_id')
        .eq('id', job.packageId)
        .eq('status', 'live')
        .is('archived_at', null)
        .maybeSingle(),
      db.from('host').select('time_zone,city_id').eq('id', hostId).maybeSingle(),
    ]);
    if (pack.error || host.error)
      throw new HostWorkspaceError(503, 'Package availability could not be checked.');
    const item = pack.data;
    if (
      !item ||
      (item.host_id !== hostId &&
        (item.host_id || (item.city_id && item.city_id !== host.data?.city_id)))
    )
      throw invalid('This package is unavailable for your workspace.');
    const checkIn = date + ' ' + clock + ':00 ' + validZone(host.data?.time_zone);
    return checked(
      await db.rpc('rpc_package_schedule', {
        p_host_id: hostId,
        p_unit_id: job.unitId,
        p_package_id: job.packageId,
        p_for_checkin_at: checkIn,
      }),
      'Package scheduled for check-in.',
    );
  }

  if (
    command.type === 'transition' &&
    collection === 'packageJobs' &&
    id &&
    status === 'Cancelled'
  ) {
    return checked(
      await db.rpc('rpc_host_workspace_package_cancel', {
        p_host_id: hostId,
        p_order_id: id,
      }),
      'Package placement cancelled.',
    );
  }

  if (command.type === 'save' && collection === 'workspace-task') {
    const { data: settings, error } = await db
      .from('host_settings_v')
      .select('time_zone')
      .eq('host_id', hostId)
      .maybeSingle();
    if (error) throw new HostWorkspaceError(503, 'The workspace time zone could not be checked.');
    return saveWorkspaceTask(
      access,
      { id, expectedVersion: command.expectedVersion, record },
      validZone(settings?.time_zone),
    );
  }

  if (command.type === 'save' && collection === 'tasks' && !id) {
    const request = z
      .object({
        unitId: uuid.optional(),
        title: name,
        detail: note.optional(),
        type: z.string().refine((value) => HOST_REQUEST_TYPES.some((type) => type.value === value)),
        kind: z.enum(['request', 'issue']).default('request'),
        ownerKind: z
          .enum(['host', 'nexg_concierge', 'nexg_support', 'nexg_rider_ops'])
          .default('nexg_concierge'),
        priority: z.enum(['Low', 'Normal', 'Urgent']),
      })
      .parse(record);
    if (request.unitId) await requireUnit(access, request.unitId);
    else if (unitScope) throw scopeError();
    return checked(
      await db.rpc('rpc_host_request_create', {
        p_host_id: hostId,
        p_payload: {
          unit_id: request.unitId,
          title: request.title,
          detail: request.detail,
          type: request.type,
          kind: request.kind,
          owner_kind: request.ownerKind,
          priority: { Low: 'low', Normal: 'medium', Urgent: 'high' }[request.priority],
        },
      }),
      'Request sent to NexG.',
    );
  }

  if (command.type === 'transition' && collection === 'tasks' && id) {
    const { data: request, error } = await db
      .from('host_request_v')
      .select('unit_id, status')
      .eq('host_id', hostId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new HostWorkspaceError(503, 'The request could not be checked.');
    if (!request || (unitScope && (!request.unit_id || !unitScope.includes(request.unit_id))))
      throw scopeError();
    if (request.status === 'resolved' || request.status === 'closed')
      throw invalid('This request is already closed.');
    const { detail, priority } = z
      .object({ detail: note.optional(), priority: z.enum(['Low', 'Normal', 'Urgent']).optional() })
      .parse(record ?? {});
    if (status === 'Done' && detail) {
      return checked(
        await db.rpc('rpc_host_request_resolve', { p_request_id: id, p_outcome: detail }),
        'Request resolved.',
      );
    }
    const nextStatus = HOST_REQUEST_STATUSES.find((state) => state.label === status)?.value;
    if (nextStatus) {
      return checked(
        await db.rpc('rpc_host_request_update', {
          p_request_id: id,
          p_status: nextStatus,
          p_note: detail,
          p_priority: priority
            ? { Low: 'low', Normal: 'medium', Urgent: 'high' }[priority]
            : undefined,
        }),
        'Request updated.',
      );
    }
    if (status === 'Escalated' && detail) {
      return checked(
        await db.rpc('rpc_host_request_escalate', { p_request_id: id, p_why: detail }),
        'Request escalated to NexG.',
      );
    }
    throw invalid('Enter the resolution or escalation details.');
  }

  if (command.type === 'save' && collection === 'qrCards' && !id) {
    const card = z
      .object({
        unitId: uuid,
        spot: z.string().refine((value) => SPOTS.some((item) => item.value === value)),
      })
      .parse(record);
    await requireUnit(access, card.unitId);
    return checked(
      await db.rpc('rpc_qr_generate', {
        p_owner_type: 'unit',
        p_owner_id: card.unitId,
        p_placement: card.spot as never,
      }),
      'QR card generated.',
    );
  }

  if (command.type === 'transition' && collection === 'qrCards' && id) {
    const { data, error } = await db
      .from('host_qr_list_v')
      .select('unit_id, status')
      .eq('host_id', hostId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new HostWorkspaceError(503, 'The QR card could not be checked.');
    if (!data?.unit_id || data.status === 'voided') throw scopeError();
    await requireUnit(access, data.unit_id);
    const { detail } = z.object({ detail: note.optional() }).parse(record ?? {});
    if (status === 'Placed') {
      return checked(await db.rpc('rpc_qr_mark_placed', { p_qr_id: id }), 'Card marked as placed.');
    }
    if (status === 'Voided' && detail) {
      return checked(
        await db.rpc('rpc_qr_void', { p_qr_id: id, p_reason: detail }),
        'Card retired.',
      );
    }
    if (status === 'Replaced' && detail) {
      return checked(
        await db.rpc('rpc_qr_replace', { p_qr_id: id, p_reason: detail }),
        'Replacement card issued.',
      );
    }
    if (status === 'Test') {
      return checked(await db.rpc('rpc_qr_test_scan', { p_qr_id: id }), 'Test scan recorded.');
    }
    throw invalid('Choose a supported card action and enter a reason.');
  }

  throw invalid('This action is unavailable in the connected workspace.');
}
