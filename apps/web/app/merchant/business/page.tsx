import Link from 'next/link';

import { loadSetupLocations } from '@/app/merchant/location-setup-actions';
import { loadSetupDocuments } from '@/app/merchant/setup-documents-actions';
import { AddBranch } from '@/components/merchant/branch-client';
import {
  BusinessDocumentTools,
  BusinessLocationTools,
} from '@/components/merchant/business/live-tools';
import {
  category,
  type Business,
  type BusinessDocument,
  type Section,
} from '@/components/merchant/business/model';
import { BusinessWorkspace } from '@/components/merchant/business/workspace';
import { InviteMember, MemberActions } from '@/components/merchant/team-client';
import { loadApplicationView } from '@/lib/merchant-application-load';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Business' };
export const dynamic = 'force-dynamic';

export default async function BusinessPage({ searchParams }: { searchParams?: { tab?: Section } }) {
  const me = await requireMerchant();
  const db = createClient();
  const mayManageSetup = me.access.setup && me.access.state !== 'legacy';
  const mayManageDocuments = mayManageSetup || me.access.state === 'legacy';

  const [profile, taxonomy, branches, members, reviews, application, evidence, locationDetails] =
    await Promise.all([
      db
        .from('merchant_home_v')
        .select('name, status, contact_email, contact_phone')
        .eq('merchant_id', me.id)
        .maybeSingle(),
      db.from('merchant').select('subcategory').eq('id', me.id).maybeSingle(),
      db
        .from('merchant_branch')
        .select('id, name, address_text, closed_at, paused_at')
        .eq('merchant_id', me.id)
        .is('deleted_at', null)
        .order('sort'),
      db
        .from('merchant_member_v')
        .select(
          'user_id, invite_id, first_name, email, invite_contact, role, branches, status, caps, created_at',
        )
        .eq('merchant_id', me.id)
        .order('created_at'),
      db
        .from('merchant_rating_v')
        .select(
          'id, branch_id, guest_first_name, stars, comment, reply_body, reply_status, created_at',
        )
        .eq('merchant_id', me.id)
        .order('created_at', { ascending: false })
        .limit(100),
      mayManageSetup
        ? loadApplicationView(db, me.id, { includePayout: false }).catch(() => null)
        : null,
      mayManageDocuments ? loadSetupDocuments() : null,
      mayManageSetup ? loadSetupLocations() : null,
    ]);

  if (profile.error || !profile.data?.name || branches.error || members.error || reviews.error) {
    return (
      <div className="p-8" role="alert">
        <h1 className="text-2xl font-bold">Business</h1>
        <p className="mt-2">Your business records could not be loaded. Refresh to try again.</p>
      </div>
    );
  }

  const record = application?.record;
  const activityIds =
    record?.payload.subcategories ??
    (taxonomy.data?.subcategory ? [taxonomy.data.subcategory] : []);
  const locationById = new Map(
    locationDetails?.ok ? locationDetails.locations.map((row) => [row.id, row]) : [],
  );
  const activities = activityIds.flatMap((id) => {
    const definition = category(id);
    if (!definition) return [];
    return [
      {
        id,
        profileId: id,
        name: definition.name,
        model: definition.defaultModel,
        methods: [],
        locationIds: (branches.data ?? []).flatMap((branch) =>
          locationById.get(branch.id)?.activityIds.includes(id) ? [branch.id] : [],
        ),
        coverage: '',
        resourceCount: 0,
        bookingEnabled: false,
        driver: false,
        source: 'NEXG' as const,
        answers: record?.payload.answersBySubcategory[id] ?? {},
        commitments: 0,
        enabled: false,
      },
    ];
  });
  const locations: Business['locations'] = (branches.data ?? []).map((branch) => {
    const details = locationById.get(branch.id);
    return {
      id: branch.id,
      name: branch.name ?? 'Unnamed location',
      type: details?.type ?? 'physical',
      address: branch.address_text ?? '',
      contact: details?.contact ?? '',
      activityIds: details?.activityIds ?? [],
      commitments: 0,
      coverage: '',
      published: false,
      liveStatus: branch.closed_at ? 'Closed' : branch.paused_at ? 'Paused' : 'On file',
    };
  });
  const team: Business['members'] = (members.data ?? []).flatMap((member) => {
    const id = member.user_id ?? member.invite_id;
    const role =
      member.role === 'owner'
        ? 'Owner'
        : member.role === 'manager'
          ? 'Manager'
          : member.role === 'cashier'
            ? 'Cashier'
            : null;
    if (!id || !role || (member.status !== 'active' && member.status !== 'pending')) return [];
    return [
      {
        id,
        name: member.first_name ?? member.invite_contact ?? member.email ?? 'Team member',
        email: member.email ?? member.invite_contact ?? '',
        role,
        locationIds: member.branches ?? [],
        state: member.status === 'active' ? 'Active' : 'Invitation pending',
        resource: '',
        activityId: '',
      },
    ];
  });
  const documents: BusinessDocument[] = evidence?.ok
    ? evidence.requirements.map((requirement) => {
        const files = evidence.onFile.filter((item) => item.requirement_id === requirement.id);
        const latest = (requirement.kind === 'national_id' ? ['front', 'back'] : [null]).map(
          (side) =>
            files
              .filter((file) => file.side === side)
              .sort((a, b) => b.created_at.localeCompare(a.created_at))[0],
        );
        const verified = latest.every((item) => item?.status === 'verified');
        const uploaded = latest.every(
          (item) => item?.status === 'verified' || item?.status === 'uploaded',
        );
        const expired = latest.some((item) => item?.status === 'expired');
        const rejected = latest.find((item) => item?.status === 'rejected');
        return {
          id: requirement.id,
          name: requirement.label,
          scope: 'Business',
          optional: !requirement.essential,
          current: verified
            ? 'Verified'
            : expired
              ? 'Expired'
              : uploaded
                ? 'Review pending'
                : 'Needed',
          version: 0,
          replacement: rejected ? 'Changes requested' : 'None',
          reason: rejected?.rejection_reason ?? '',
          filename: '',
          size: 0,
          expires: files.find((item) => item.expires_at)?.expires_at ?? '',
          note: evidence.asked.find((item) => item.requirement_id === requirement.id)?.note ?? '',
        };
      })
    : [];
  const feedback: Business['reviews'] = (reviews.data ?? []).flatMap((review) => {
    if (!review.id || !review.stars) return [];
    return [
      {
        id: review.id,
        name: review.guest_first_name ?? 'Customer',
        rating: review.stars,
        locationId: review.branch_id ?? '',
        at: review.created_at ?? '',
        text: review.comment ?? '',
        reply: review.reply_status === 'published' ? (review.reply_body ?? '') : '',
        draft: '',
        reported: false,
      },
    ];
  });
  const data: Business = {
    schema: 1,
    profileId: activityIds[0] ?? '',
    revision: record?.revision ?? 1,
    accountStatus: ['paused', 'suspended'].includes(profile.data.status ?? '')
      ? 'Paused'
      : me.access.state === 'changes_requested'
        ? 'Changes requested'
        : 'Approved',
    profile: {
      name: profile.data.name,
      description: '',
      email: profile.data.contact_email ?? '',
      contact: profile.data.contact_phone ?? '',
      logo: '',
      cover: '',
    },
    activities,
    locations,
    members: team,
    documents,
    reviews: feedback,
    requests: [],
    history: [],
  };

  const manage = 'text-gold-text text-sm font-bold underline';
  const branchChoices = locations.map(({ id, name }) => ({ id, name }));
  const memberTools = Object.fromEntries(
    (members.data ?? []).flatMap((member) => {
      const id = member.user_id ?? member.invite_id;
      if (!id || !member.role || !member.status || !member.created_at) return [];
      const caps =
        member.caps && typeof member.caps === 'object' && !Array.isArray(member.caps)
          ? Object.fromEntries(
              Object.entries(member.caps).filter(
                (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
              ),
            )
          : null;
      return [
        [
          id,
          <MemberActions
            key={id}
            merchantId={me.id}
            branches={branchChoices}
            member={{
              ...member,
              role: member.role,
              status: member.status,
              created_at: member.created_at,
              caps,
            }}
          />,
        ],
      ];
    }),
  );
  return (
    <BusinessWorkspace
      initialTab={searchParams?.tab}
      liveData={data}
      liveMemberTools={memberTools}
      liveTools={{
        profile: record ? (
          <Link className={manage} href={`/merchants/register?merchantId=${record.merchant_id}`}>
            Review registration details
          </Link>
        ) : undefined,
        activities: (
          <div className="flex flex-wrap gap-4">
            <Link className={manage} href="/merchant/offerings">
              Manage offerings
            </Link>
            <Link className={manage} href="/merchant/availability">
              Manage availability
            </Link>
            {mayManageSetup && !record ? (
              <p>Saved activities could not be loaded. Refresh to try again.</p>
            ) : null}
          </div>
        ),
        locations: mayManageSetup ? (
          <BusinessLocationTools activities={activities.map(({ id, name }) => ({ id, name }))} />
        ) : (
          <AddBranch merchantId={me.id} />
        ),
        team: <InviteMember merchantId={me.id} branches={branchChoices} />,
        documents: mayManageDocuments ? (
          <>
            {evidence && !evidence.ok && <p role="alert">{evidence.message}</p>}
            <BusinessDocumentTools />
          </>
        ) : (
          <p className="text-sm">The application owner manages document evidence.</p>
        ),
      }}
    />
  );
}
