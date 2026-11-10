import 'server-only';
import { guideDocument } from './guides';

import { coverOf, handoffLabel, photosOf, spotLabel } from '@/lib/host-workspace/vocab';

import { dateKey, nights } from '../../../../hosts-workspace/src/model';
import type { Stay, WorkspaceData, WorkspaceSnapshot } from '../../../../hosts-workspace/src/model';
import { HostWorkspaceError, type HostWorkspaceAccess } from './access';
import { RECEIPT_COLUMNS, toReceipts } from '@/lib/receipts';

const defaultZone = 'Africa/Nairobi';

export function validZone(zone?: string | null) {
  if (!zone) return defaultZone;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return zone;
  } catch {
    return defaultZone;
  }
}

function label(value: string | null) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ') : 'Unknown';
}

function loaded<T>(result: { data: T; error: unknown }) {
  if (result.error)
    throw new HostWorkspaceError(503, 'Your host records could not be loaded. Try again shortly.');
  return result.data;
}

export async function allRows<T>(
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const size = 500;
  const rows: T[] = [];
  for (let offset = 0; ; offset += size) {
    const batch = loaded(await read(offset, offset + size - 1)) ?? [];
    rows.push(...batch);
    if (batch.length < size) return rows;
  }
}

export async function readHostWorkspace(access: HostWorkspaceAccess): Promise<WorkspaceSnapshot> {
  const { db, hostId, unitScope } = access;
  const units =
    unitScope?.length === 0
      ? []
      : await allRows((from, to) => {
          const query = db
            .from('unit')
            .select(
              'id, property_id, name, status, max_guests, bedrooms, bathrooms, nightly_rate_kes, photos, caretaker_name, handoff, label_public, floor, address_line, building, unit_no, handoff_note, delivery_hours, checkin_time, checkout_time',
            )
            .eq('host_id', hostId)
            .is('archived_at', null);
          if (unitScope) query.in('id', unitScope);
          return query.order('id').range(from, to);
        });
  const propertyIds = Array.from(
    new Set(units.flatMap((unit) => (unit.property_id ? [unit.property_id] : []))),
  );

  const [
    properties,
    stays,
    requests,
    settingsResult,
    invoices,
    cards,
    deliveries,
    jobs,
    manual,
    members,
    profileResult,
    themeResult,
    referrals,
    activityResult,
    setupResult,
    homeResult,
    readiness,
    calendars,
    catalogue,
    rules,
    workspaceTasks,
    guideRows,
    guideVersions,
  ] = await Promise.all([
    unitScope && propertyIds.length === 0
      ? []
      : allRows((from, to) => {
          const query = db
            .from('property')
            .select(
              'id, name, area, kind, photos, description, listed, floors, summary, check_in_from, check_out_by',
            )
            .eq('host_id', hostId)
            .is('deleted_at', null);
          if (unitScope) query.in('id', propertyIds);
          return query.order('id').range(from, to);
        }),
    unitScope?.length === 0
      ? []
      : allRows((from, to) => {
          const query = db
            .from('host_stay_v')
            .select(
              'id, unit_id, guest_first_name, check_in, check_out, party_adults, party_children, source, status, rate_kes, conflict_flagged, reviewed_at, stay_rating, stay_review, hold_expires_at, hold_expired, notes',
            )
            .eq('host_id', hostId);
          if (unitScope) query.in('unit_id', unitScope);
          return query.order('check_in', { ascending: false }).order('id').range(from, to);
        }),
    unitScope?.length === 0
      ? []
      : allRows((from, to) => {
          const query = db
            .from('host_request_v')
            .select(
              'id, unit_id, title, reference, status, priority, type, detail, outcome, overdue, due_at, resolved_at, owner_kind, raised_by, minutes_left, guest_first_name, kind',
            )
            .eq('host_id', hostId);
          if (unitScope) query.in('unit_id', unitScope);
          return query.order('created_at', { ascending: false }).order('id').range(from, to);
        }),
    db
      .from('host_settings_v')
      .select(
        'display_name, email, language, time_zone, billing_method, landing_headline, landing_brand_colour, notification_rules, quiet_hours, features, tier',
      )
      .eq('host_id', hostId)
      .maybeSingle(),
    unitScope
      ? []
      : allRows((from, to) =>
          db
            .from('host_invoice')
            .select('id, created_at, due_at, period, total, status')
            .eq('host_id', hostId)
            .order('created_at', { ascending: false })
            .order('id')
            .range(from, to),
        ),
    unitScope?.length === 0
      ? []
      : allRows((from, to) => {
          const query = db
            .from('host_qr_list_v')
            .select(
              'id, unit_id, code, spot, status, scans_all, scans_30d, orders, generated_at, last_scan_at',
            )
            .eq('host_id', hostId);
          if (unitScope) query.in('unit_id', unitScope);
          return query.order('id').range(from, to);
        }),
    unitScope?.length === 0
      ? []
      : allRows((from, to) => {
          const query = db
            .from('host_delivery_v')
            .select(
              'order_id, unit_id, reference, merchant_name, handoff, stage, has_proof, placed_at, eta_at, delivered_at, handed_to, guest_first_name, total_cents',
            )
            .eq('host_id', hostId);
          if (unitScope) query.in('unit_id', unitScope);
          return query.order('placed_at', { ascending: false }).order('order_id').range(from, to);
        }),
    unitScope?.length === 0
      ? []
      : allRows((from, to) => {
          const query = db
            .from('host_package_order_v')
            .select(
              'id, unit_id, package_name, status, for_checkin_at, has_photo, order_reference, lead_hours, price_kes, package_description',
            )
            .eq('host_id', hostId);
          if (unitScope) query.in('unit_id', unitScope);
          return query.order('for_checkin_at', { ascending: false }).order('id').range(from, to);
        }),
    unitScope?.length === 0
      ? []
      : allRows((from, to) => {
          const query = db
            .from('host_manual_finance')
            .select(
              'id, unit_id, stay_id, kind, amount_minor, recorded_on, description, category, reference, status',
            )
            .eq('host_id', hostId);
          if (unitScope) query.in('unit_id', unitScope);
          return query.order('recorded_on', { ascending: false }).order('id').range(from, to);
        }),
    allRows((from, to) =>
      db
        .from('host_user')
        .select('user_id, role, units, accepted_at')
        .eq('host_id', hostId)
        .order('user_id')
        .range(from, to),
    ),
    db
      .from('host')
      .select('workspace_profile, referral_code, phone, city_id')
      .eq('id', hostId)
      .maybeSingle(),
    db
      .from('user_theme_v')
      .select('theme, accent, sidebar, density, font_size')
      .eq('user_id', access.userId)
      .maybeSingle(),
    unitScope
      ? []
      : allRows((from, to) =>
          db
            .from('host_referral_v')
            .select(
              'id, referred_area, referred_units, created_at, stage, reward_amount_kes, reward_status',
            )
            .eq('referrer_host_id', hostId)
            .order('created_at', { ascending: false })
            .order('id')
            .range(from, to),
        ),
    access.role === 'Owner' && !unitScope
      ? db.rpc('rpc_host_workspace_settings_activity', { p_host_id: hostId })
      : { data: [], error: null },
    db
      .from('host_setup_progress_v')
      .select(
        'is_live, status, submitted_at, verification_code, verification_method, step_about, step_unit, step_handoff, step_packages, step_verify',
      )
      .eq('host_id', hostId)
      .maybeSingle(),
    db.from('host_home_v').select('went_live_at').eq('host_id', hostId).maybeSingle(),
    unitScope?.length === 0
      ? []
      : allRows((from, to) => {
          const query = db
            .from('unit_readiness_v')
            .select('unit_id, address_done, handoff_done, contact_confirmed, hours_done, qr_placed')
            .eq('host_id', hostId);
          if (unitScope) query.in('unit_id', unitScope);
          return query.order('unit_id').range(from, to);
        }),
    unitScope
      ? []
      : allRows((from, to) =>
          db
            .from('calendar_connection_v')
            .select(
              'id, property_id, property_name, provider, label, status, last_synced_at, last_error, stays_created',
            )
            .eq('host_id', hostId)
            .order('created_at', { ascending: false })
            .order('id')
            .range(from, to),
        ),
    allRows((from, to) =>
      db
        .from('welcome_package')
        .select('id, name, description, items, price, lead_hours, city_id, host_id')
        .is('archived_at', null)
        .eq('status', 'live')
        .or('host_id.is.null,host_id.eq.' + hostId)
        .order('sort')
        .order('id')
        .range(from, to),
    ),
    allRows((from, to) =>
      db
        .from('host_priority_rule')
        .select('priority, label, minutes')
        .eq('host_id', hostId)
        .order('minutes')
        .order('priority')
        .range(from, to),
    ),
    unitScope?.length === 0
      ? []
      : allRows((from, to) =>
          db
            .from('host_workspace_task')
            .select('*,unit!inner(host_id,archived_at)')
            .eq('unit.host_id', hostId)
            .is('unit.archived_at', null)
            .order('due_at')
            .order('id')
            .range(from, to),
        ),
    allRows((from, to) =>
      db
        .from('host_unit_guide')
        .select('unit_id,revision,document,published_id,unit!inner(host_id,archived_at)')
        .eq('unit.host_id', hostId)
        .is('unit.archived_at', null)
        .order('unit_id')
        .range(from, to),
    ),
    allRows((from, to) =>
      db
        .from('host_unit_guide_version')
        .select(
          'id,unit_id,article_count,published_at,host_unit_guide!inner(unit!inner(host_id,archived_at))',
        )
        .eq('host_unit_guide.unit.host_id', hostId)
        .is('host_unit_guide.unit.archived_at', null)
        .order('published_at', { ascending: false })
        .order('id')
        .range(from, to),
    ),
  ]);
  const guides = new Map(
    guideRows.map((row) => [
      row.unit_id,
      {
        revision: row.revision,
        publishedId: row.published_id,
        document: guideDocument.safeParse(row.document).data ?? {
          articles: [],
          planId: null,
          modelId: null,
        },
      },
    ]),
  );
  const settings = loaded(settingsResult);
  const profileRow = loaded(profileResult);
  const savedProfile = profileRow?.workspace_profile;
  const profile =
    savedProfile && typeof savedProfile === 'object' && !Array.isArray(savedProfile)
      ? savedProfile
      : {};
  const savedText = (key: string, fallback = '') =>
    typeof profile[key] === 'string' ? profile[key] : fallback;
  const theme = loaded(themeResult);
  const activity = loaded(activityResult) ?? [];
  const zone = validZone(settings?.time_zone);
  const localDate = (value: string) => dateKey(new Date(value), zone);
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
  });
  const localDateTime = (value: string) => localDate(value) + 'T' + clock.format(new Date(value));

  const covers = new Map<string, string>();
  for (const row of [...properties, ...units]) {
    const cover = coverOf(photosOf(row.photos));
    if (row.id && cover) covers.set(row.id, cover.path);
  }
  const photoUrls = new Map<string, string>();
  const paths = Array.from(new Set(covers.values()));
  for (let offset = 0; offset < paths.length; offset += 100) {
    const { data } = await db.storage
      .from('host-photos')
      .createSignedUrls(paths.slice(offset, offset + 100), 3600);
    for (const photo of data ?? []) {
      if (photo.path && photo.signedUrl) photoUrls.set(photo.path, photo.signedUrl);
    }
  }
  const image = (id: string) => photoUrls.get(covers.get(id) ?? '') ?? '';

  const stayStatus: Record<string, string> = {
    booked: 'Confirmed',
    in_stay: 'Checked in',
    departed: 'Completed',
    cancelled: 'Cancelled',
    held: 'Hold',
    blocked: 'Blocked',
  };
  const actor = {
    id: access.userId,
    name: settings?.display_name || access.name,
    email: access.email,
    role: access.role,
    propertyIds: unitScope ? propertyIds : [],
  };
  /* Receipts cover the whole host account, so staff scoped to some units do not get them. */
  const receipts = unitScope
    ? []
    : toReceipts(
        loaded(
          await db
            .from('receipt' as never)
            .select(RECEIPT_COLUMNS)
            .eq('party_type', 'host')
            .eq('party_id', hostId)
            .order('issued_at', { ascending: false })
            .limit(200),
        ),
      );

  const data: WorkspaceData = {
    properties: properties
      .map((row) => ({
        id: row.id,
        name: row.name,
        area: row.area ?? '',
        description: row.description ?? '',
        kind: row.kind,
        image: image(row.id),
        status: row.listed ? 'Active' : 'Unlisted',
        floors: row.floors,
        summary: row.summary ?? '',
        checkInFrom: row.check_in_from?.slice(0, 5) ?? '',
        checkOutBy: row.check_out_by?.slice(0, 5) ?? '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    units: units
      .flatMap((row) => {
        if (!row.id || !row.name) return [];
        const hours = row.delivery_hours;
        const window = hours && typeof hours === 'object' && !Array.isArray(hours) ? hours : {};
        const deliveryFrom = typeof window.from === 'string' ? window.from : '';
        const deliveryTo = typeof window.to === 'string' ? window.to : '';
        return [
          {
            id: row.id,
            propertyId: row.property_id ?? '',
            name: row.name,
            guideRevision: guides.get(row.id)?.revision ?? 0,
            guidePublished: Boolean(guides.get(row.id)?.publishedId),
            planId: guides.get(row.id)?.document.planId ?? undefined,
            modelId: guides.get(row.id)?.document.modelId ?? undefined,
            status: label(row.status),
            readiness: row.status === 'live' ? 'Ready' : label(row.status),
            capacity: row.max_guests ?? 0,
            bedrooms: row.bedrooms ?? 0,
            bathrooms: row.bathrooms ?? 0,
            rateKes: row.nightly_rate_kes,
            nightlyMinor: (row.nightly_rate_kes ?? 0) * 100,
            image: image(row.id),
            deliveryRule: row.handoff ? handoffLabel(row.handoff) : '',
            contact: row.caretaker_name ?? '',
            hours: deliveryFrom && deliveryTo ? deliveryFrom + ' – ' + deliveryTo : '',
            access: [row.address_line, row.building, row.unit_no].filter(Boolean).join(' · '),
            labelPublic: row.label_public ?? '',
            floor: row.floor ?? '',
            addressLine: row.address_line ?? '',
            building: row.building ?? '',
            unitNumber: row.unit_no ?? '',
            handoff: row.handoff ?? '',
            handoffNote: row.handoff_note ?? '',
            deliveryFrom,
            deliveryTo,
            checkInFrom: row.checkin_time?.slice(0, 5) ?? '',
            checkOutBy: row.checkout_time?.slice(0, 5) ?? '',
          },
        ];
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    stays: stays.flatMap((row) => {
      if (!row.id || !row.unit_id || !row.check_in || !row.check_out) return [];
      const start = localDate(row.check_in);
      const end = localDate(row.check_out);
      const stay: Stay = {
        id: row.id,
        ref: row.id.slice(0, 8).toUpperCase(),
        unitId: row.unit_id,
        guest:
          row.status === 'blocked'
            ? row.notes
              ? 'Blocked · ' + row.notes
              : 'Blocked'
            : (row.guest_first_name ?? 'Guest'),
        start,
        end,
        arrivalTime: clock.format(new Date(row.check_in)),
        /* A hold that ran out is gone, even before the minute cron releases it. */
        status: row.hold_expired
          ? 'Cancelled'
          : (stayStatus[row.status ?? ''] ?? label(row.status)),
        holdUntil: row.status === 'held' && row.hold_expires_at ? row.hold_expires_at : undefined,
        departTime: clock.format(new Date(row.check_out)),
        source: row.source,
        kind: row.source === 'nexg' ? 'NexG' : label(row.source),
        guests: (row.party_adults ?? 0) + (row.party_children ?? 0),
        adults: row.party_adults ?? 1,
        children: row.party_children ?? 0,
        rateKes: row.rate_kes,
        totalMinor: 0,
        conflict: row.conflict_flagged,
      };
      stay.totalMinor = (row.rate_kes ?? 0) * nights(stay) * 100;
      return [stay];
    }),
    tasks: [
      ...workspaceTasks.map((row) => ({
        id: row.id,
        unitId: row.unit_id,
        stayId: row.stay_id ?? undefined,
        title: row.title,
        type: row.kind,
        assigneeId: row.assignee_id ?? '',
        due: localDateTime(row.due_at),
        priority: row.priority,
        status: row.status,
        checklist: row.checklist.join('\n'),
        completedChecks: row.completed_checks.join('\n'),
        evidence: row.evidence,
        comments: row.comments,
        cadence: row.cadence,
        inspection: row.inspection,
        version: row.version,
        updatedAt: localDateTime(row.updated_at),
        workspaceTask: true,
      })),
      ...requests.flatMap((row) =>
        row.id && row.title
          ? [
              {
                id: row.id,
                unitId: row.unit_id ?? '',
                title: row.title,
                type: label(row.type),
                assigneeId: '',
                due: row.due_at ? localDateTime(row.due_at) : '',
                priority:
                  row.priority === 'high' ? 'Urgent' : row.priority === 'low' ? 'Low' : 'Normal',
                status:
                  row.status === 'resolved' || row.status === 'closed'
                    ? 'Done'
                    : row.status === 'open'
                      ? 'To do'
                      : 'In progress',
                requestStatus: label(row.status),
                overdue: row.overdue,
                reference: row.reference ?? '',
                detail: row.detail ?? '',
                outcome: row.outcome ?? '',
                checklist: '',
                requestKind: row.kind ?? 'request',
                ownerKind: row.owner_kind ?? '',
                raisedBy: label(row.raised_by),
                guest: row.guest_first_name ?? '',
                minutesLeft: row.minutes_left,
                requestType: row.type ?? 'other',
                updatedAt: row.resolved_at ? localDateTime(row.resolved_at) : undefined,
              },
            ]
          : [],
      ),
    ],
    receipts: receipts.map((row) => ({
      id: row.id,
      title: row.number,
      number: row.number,
      kind: row.kind,
      description: row.title,
      amountMinor: row.total_cents,
      date: localDate(row.issued_at),
      method: row.method ?? '',
      reference: row.method_ref ?? '',
    })),
    invoices: invoices.map((row) => ({
      id: row.id,
      title: 'NexG invoice · ' + row.period,
      type: 'NexG service',
      amountMinor: row.total,
      date: localDate(row.created_at),
      due: row.due_at ?? '',
      status: label(row.status),
    })),
    qrCards: cards.flatMap((row) =>
      row.id && row.code && row.unit_id
        ? [
            {
              id: row.id,
              unitId: row.unit_id,
              spot: spotLabel(row.spot),
              status: label(row.status),
              token: row.code,
              scans: row.scans_all ?? 0,
              scans30d: row.scans_30d ?? 0,
              orders: row.orders ?? 0,
              createdAt: row.generated_at ?? undefined,
              lastScanAt: row.last_scan_at ?? undefined,
            },
          ]
        : [],
    ),
    deliveries: deliveries.flatMap((row) =>
      row.order_id && row.unit_id
        ? [
            {
              id: row.order_id,
              unitId: row.unit_id,
              title: row.merchant_name ?? 'Guest order',
              stage: label(row.stage),
              rule: row.handoff ? handoffLabel(row.handoff) : '',
              reference: row.reference ?? '',
              hasProof: row.has_proof,
              proof: row.has_proof ? 'Photo on record' : 'Pending',
              placedAt: row.placed_at ? localDateTime(row.placed_at) : '',
              eta: row.eta_at ? localDateTime(row.eta_at) : '',
              deliveredAt: row.delivered_at ? localDateTime(row.delivered_at) : '',
              handedTo: label(row.handed_to),
              guest: row.guest_first_name ?? '',
              amountMinor: row.total_cents,
            },
          ]
        : [],
    ),
    packageJobs: jobs.flatMap((row) =>
      row.id && row.unit_id
        ? [
            {
              id: row.id,
              unitId: row.unit_id,
              packageId: '',
              title: row.package_name ?? 'Welcome package',
              due: row.for_checkin_at ? localDateTime(row.for_checkin_at) : '',
              status: label(row.status),
              hasPhoto: row.has_photo,
              proof: row.has_photo ? 'Photo on record' : 'Pending',
              reference: row.order_reference ?? '',
              amountMinor: row.price_kes === null ? null : row.price_kes * 100,
              leadHours: row.lead_hours,
              description: row.package_description ?? '',
            },
          ]
        : [],
    ),
    feedback: stays.flatMap((row) =>
      row.id && row.unit_id && row.reviewed_at && row.stay_rating !== null
        ? [
            {
              id: row.id,
              stayId: row.id,
              unitId: row.unit_id,
              date: localDate(row.reviewed_at),
              rating: row.stay_rating,
              comment: row.stay_review ?? '',
            },
          ]
        : [],
    ),
    team: members.map((row) => ({
      id: row.user_id,
      name: row.user_id === actor.id ? actor.name : label(row.role),
      email: row.user_id === actor.id ? actor.email : '',
      role: row.role === 'owner' ? 'Owner' : row.role === 'manager' ? 'Manager' : 'Caretaker',
      propertyIds: row.units
        ? [
            ...new Set(
              units
                .filter((unit) => unit.id && row.units!.includes(unit.id))
                .flatMap((unit) => (unit.property_id ? [unit.property_id] : [])),
            ),
          ]
        : [],
      status: row.accepted_at ? 'Active' : 'Invited',
      unitCount: row.units?.length ?? null,
    })),
    payments: manual.flatMap((row) =>
      row.kind !== 'Expense' && row.stay_id
        ? [
            {
              id: row.id,
              stayId: row.stay_id,
              amountMinor: row.amount_minor,
              type: row.kind,
              status: row.status,
              date: row.recorded_on,
              reference: row.reference,
            },
          ]
        : [],
    ),
    expenses: manual.flatMap((row) =>
      row.kind === 'Expense'
        ? [
            {
              id: row.id,
              unitId: row.unit_id,
              category: row.category,
              description: row.description,
              amountMinor: row.amount_minor,
              date: row.recorded_on,
              status: row.status,
            },
          ]
        : [],
    ),
    articles: [...guides].flatMap(([unitId, guide]) =>
      guide.document.articles.map((article) => ({ ...article, unitId })),
    ),
    packages: catalogue
      .filter(
        (row) =>
          row.host_id === hostId || row.city_id === null || row.city_id === profileRow?.city_id,
      )
      .map((row) => ({
        id: row.id,
        title: row.name,
        description: row.description ?? '',
        leadHours: row.lead_hours ?? 0,
        items: Array.isArray(row.items)
          ? row.items.filter((item) => typeof item === 'string').join('\n')
          : '',
        amountMinor: (row.price ?? 0) * 100,
        priced: row.price !== null,
        editable: !unitScope && row.host_id === hostId,
      })),
    priorityRules: rules.map((row) => ({
      id: row.priority,
      title: row.label,
      minutes: row.minutes,
    })),
    devices: [{ id: access.userId, title: 'This session', status: 'Active' }],
    referrals: referrals.flatMap((row) =>
      row.id
        ? [
            {
              id: row.id,
              title: row.referred_area || 'Host referral',
              status: label(row.stage),
              units: row.referred_units,
              date: row.created_at ?? '',
              rewardStatus: label(row.reward_status),
              amountMinor: (row.reward_amount_kes ?? 0) * 100,
            },
          ]
        : [],
    ),
    audit: activity.map((row) => ({
      id: String(row.id),
      title:
        row.action === 'host.settings_changed'
          ? 'Workspace settings saved'
          : 'Workspace profile saved',
      date: row.at,
      actor: row.own ? 'You' : 'Workspace',
    })),
    versions: guideVersions.map((row) => ({
      id: row.id,
      unitId: row.unit_id,
      date: localDateTime(row.published_at),
      articleCount: row.article_count,
      status: guides.get(row.unit_id)?.publishedId === row.id ? 'Current' : 'Previous',
    })),
    calendarConnections: calendars.flatMap((row) =>
      row.id
        ? [
            {
              id: row.id,
              propertyId: row.property_id,
              property: row.property_name,
              provider: row.provider,
              title: row.label ?? '',
              status: row.status ?? 'pending',
              date: row.last_synced_at ?? '',
              imported: row.stays_created ?? 0,
              error: row.last_error?.replace(/https?:\/\/\S+/gi, '[feed URL]') ?? '',
            },
          ]
        : [],
    ),
    settings: {
      workspace: actor.name,
      business: savedText('business', actor.name),
      currency: 'KES',
      timezone: zone,
      language: settings?.language || 'en',
      checkIn: savedText('checkIn', '15:00'),
      checkOut: savedText('checkOut', '11:00'),
      signature: savedText('signature'),
      email: settings?.email ?? '',
      folioEnabled:
        settings?.features &&
        typeof settings.features === 'object' &&
        !Array.isArray(settings.features)
          ? settings.features.charge_to_room === true
          : false,
      billingMethod: settings?.billing_method ?? '',
      tier: settings?.tier ?? '',
      billingPreference: savedText('billingPreference', 'Manual record'),
      landingHeadline: settings?.landing_headline ?? '',
      landingColour: settings?.landing_brand_colour ?? '',
      guestBrand: savedText('guestBrand'),
      logo: savedText('logo'),
      invoiceAccess: !unitScope,
      referralCode: !unitScope ? profileRow?.referral_code : null,
      phone: profileRow?.phone ? '•••• ' + profileRow.phone.slice(-4) : '',
      notifications: {
        bookings: profile.bookings !== false,
        daily: profile.daily !== false,
        tasks: profile.tasks !== false,
      },
      notificationRules: settings?.notification_rules ?? {},
      quietHours: settings?.quiet_hours ?? {},
      features: settings?.features ?? {},
      theme: {
        theme: theme?.theme ?? 'nexg',
        accent: theme?.accent ?? null,
        sidebar: theme?.sidebar ?? 'dark',
        density: theme?.density ?? 'comfortable',
        font_size: theme?.font_size ?? 'default',
      },
      settingsWritable: access.role === 'Owner' && !unitScope,
    },
  };
  const setup = loaded(setupResult);
  const home = loaded(homeResult);
  return {
    actor,
    data,
    today: dateKey(new Date(), zone),
    propertyWrites: !unitScope,
    setup: {
      live: setup?.is_live === true,
      status: label(setup?.status ?? null),
      verificationCode: !unitScope ? (setup?.verification_code ?? null) : null,
      verificationMethod: setup?.verification_method ?? null,
      submittedAt: setup?.submitted_at ?? null,
      verifiedAt: home?.went_live_at ?? null,
      steps: {
        profile: setup?.step_about === true,
        unit: setup?.step_unit === true,
        handoff: setup?.step_handoff === true,
        packages: setup?.step_packages === true,
        verification: setup?.step_verify === true,
      },
      readiness: readiness.flatMap((row) =>
        row.unit_id
          ? [
              {
                unitId: row.unit_id,
                address: row.address_done === true,
                handoff: row.handoff_done === true,
                contact: row.contact_confirmed === true,
                hours: row.hours_done === true,
                qr: row.qr_placed === true,
              },
            ]
          : [],
      ),
    },
  };
}
