'use client';

import { Button, Input, useToast } from '@nexg/ui';
import { Building2, Plus, Shield, Smartphone, Store, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

import { Chip } from './controls';
import { ContinueButton, FooterNote, OnboardingShell } from './shell';
import { useOnboarding } from './store';
import { NoDraft } from './no-draft';

interface Item {
  id?: string;
  name: string;
  description: string;
  price_kes: number | null;
  contains_alcohol: boolean;
}

/* Enough to catch what a merchant would actually type on a Nairobi menu. It
   is a prompt, not a ruling — the toggle on the row is the real answer. */
const ALCOHOL_WORDS =
  /\b(beer|lager|wine|whisk(e)?y|vodka|gin|tusker|white cap|guinness|spirits?|brandy|rum|tequila|cider|champagne|prosecco)\b/i;

const RAILS = [
  {
    value: 'mpesa_till',
    icon: Smartphone,
    label: 'M-Pesa till',
    badge: 'Most merchants',
    blurb: 'Fastest. Settlement lands on Friday by 12:00.',
  },
  {
    value: 'mpesa_paybill',
    icon: Store,
    label: 'M-Pesa paybill',
    badge: null,
    blurb: 'Enter paybill and account number.',
  },
  {
    value: 'bank',
    icon: Building2,
    label: 'Bank account',
    badge: null,
    blurb: 'Any Kenyan bank. Arrives next working day.',
  },
];

/**
 * Step 6 — where the money goes, and the first few things to sell.
 *
 * The items are saved as draft catalogue rows against the same tables the
 * live merchant page reads, so what the merchant types here is what a guest
 * eventually sees. Prices may be left empty: a merchant who does not know
 * their price yet should not be made to invent one to get past this screen.
 */
export function PayoutStep() {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, categories, patch, refresh } = useOnboarding();

  const config = categories.find((c) => c.category === draft?.category);
  const noun =
    config?.card_kind === 'services'
      ? 'services'
      : config?.card_kind === 'menu'
        ? 'menu items'
        : 'products';

  const rail = draft?.payout_rail ?? 'mpesa_till';
  const account = draft?.payout_account ?? {};

  const [items, setItems] = React.useState<Item[]>([]);
  const [email, setEmail] = React.useState(draft?.contact_email ?? '');
  const [submitting, setSubmitting] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  const draftId = draft?.id ?? null;

  React.useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('catalogue_item')
        .select('id, name, description, price_kes')
        .eq('merchant_id', draftId)
        .order('sort');
      if (cancelled) return;
      const rows = (data as Item[] | null) ?? [];
      setItems(
        rows.length > 0
          ? rows.map((r) => ({ ...r, description: r.description ?? '', contains_alcohol: false }))
          : [blankItem(), blankItem(), blankItem(), blankItem(), blankItem()],
      );
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  /*
   * M-Pesa till is shown as chosen from the moment this step opens, so it has
   * to be chosen in the database too. Without this, a merchant who typed a
   * till number and pressed Submit — never having tapped the tile that was
   * already highlighted — arrived with an account and no rail, and the
   * readiness check counted their payout as unset.
   */
  const railIsSet = !!draft?.payout_rail;
  React.useEffect(() => {
    if (draftId && !railIsSet) patch({ payout_rail: 'mpesa_till' }, 6);
  }, [draftId, railIsSet, patch]);

  const setRail = (next: string) => {
    patch({ payout_rail: next, payout_account: {} }, 6);
  };

  const setAccountField = (key: string, value: string) => {
    patch({ payout_account: { ...account, [key]: value } }, 6);
  };

  /** Writes the named rows and drops the blank ones. */
  const saveItems = async () => {
    if (!draftId) return;
    const named = items.filter((i) => i.name.trim());
    if (named.length === 0) return;

    const supabase = createClient();

    /* One section, named for what this kind of business has. A merchant who
       wants headings builds them in the dashboard. */
    const sectionName =
      config?.card_kind === 'services'
        ? 'Services'
        : config?.card_kind === 'menu'
          ? 'Menu'
          : 'Products';
    const { data: section } = await supabase
      .from('catalogue_section')
      .upsert(
        { merchant_id: draftId, name: sectionName, sort: 0 },
        { onConflict: 'merchant_id,name' },
      )
      .select('id')
      .maybeSingle();

    const sectionId = (section as { id: string } | null)?.id;
    if (!sectionId) return;

    await supabase.from('catalogue_item').delete().eq('merchant_id', draftId);
    await supabase.from('catalogue_item').insert(
      named.map((item, index) => ({
        merchant_id: draftId,
        section_id: sectionId,
        name: item.name.trim(),
        description: item.description.trim() || null,
        price_kes: item.price_kes,
        age_restricted: item.contains_alcohol,
        sort: index,
      })),
    );
    await refresh();
  };

  const submit = async () => {
    if (!draftId) return;
    setSubmitting(true);

    await saveItems();
    if (email && email !== draft?.contact_email) patch({ contact_email: email }, 6);

    const supabase = createClient();
    await supabase.rpc('rpc_merchant_payout_name_check', { p_merchant_id: draftId });
    const { error } = await supabase.rpc('rpc_merchant_submit', { p_merchant_id: draftId });
    setSubmitting(false);

    if (error) {
      toast({ title: 'Not quite ready', description: error.message, tone: 'danger' });
      return;
    }
    router.push('/merchants/status');
  };

  if (!draftId) return <NoDraft step={6} eyebrow="Getting paid" startHref="/merchants/apply/start" what="set payout details for" />;
  if (!loaded) return null;

  return (
    <OnboardingShell
      step={6}
      eyebrow="Almost there"
      title="Where should Friday’s money go?"
      intro={`We settle every Friday for the week before, one statement per order. Tell us where, and drop in a few ${noun} so guests have something to order on day one.`}
      footer={
        <>
          <Button
            variant="outline"
            size="lg"
            onClick={() => router.push('/merchants/apply/documents')}
          >
            Back
          </Button>
          <ContinueButton loading={submitting} loadingText="Sending…" onClick={() => void submit()}>
            Submit for verification
          </ContinueButton>
        </>
      }
    >
      {/* -------------------------------------------------------------- rails */}
      <div className="grid gap-4 lg:grid-cols-3">
        {RAILS.map((option) => {
          const selected = rail === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setRail(option.value)}
              className={`focus-visible:ring-gold rounded-2xl border p-5 text-left transition-colors focus:outline-none focus-visible:ring-2 ${
                selected ? 'border-ink bg-ink text-white' : 'border-border bg-surface'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  aria-hidden="true"
                  className="bg-gold text-ink flex h-10 w-10 items-center justify-center rounded-xl"
                >
                  <option.icon className="h-4 w-4" />
                </span>
                {option.badge && (
                  <span
                    className={`rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold uppercase tracking-wide ${
                      selected ? 'bg-gold text-ink' : 'bg-gold-soft text-gold-text'
                    }`}
                  >
                    {option.badge}
                  </span>
                )}
              </div>
              <p className="mt-4 text-[1.0625rem] font-extrabold">{option.label}</p>
              <p
                className={`mt-1 text-[0.8125rem] leading-[1.6] ${selected ? 'text-white/70' : 'text-muted'}`}
              >
                {option.blurb}
              </p>
            </button>
          );
        })}
      </div>

      {/* ---------------------------------------------------------- the fields */}
      <div className="border-border-strong bg-surface mt-4 rounded-2xl border p-5">
        <div className="grid gap-4 lg:grid-cols-2">
          {rail === 'mpesa_till' && (
            <Input
              id="till"
              label="Till number"
              inputMode="numeric"
              defaultValue={account['till'] ?? ''}
              onBlur={(event) => setAccountField('till', event.target.value)}
            />
          )}

          {rail === 'mpesa_paybill' && (
            <>
              <Input
                id="paybill"
                label="Paybill number"
                inputMode="numeric"
                defaultValue={account['paybill'] ?? ''}
                onBlur={(event) => setAccountField('paybill', event.target.value)}
              />
              <Input
                id="paybill_account"
                label="Account number"
                defaultValue={account['account'] ?? ''}
                onBlur={(event) => setAccountField('account', event.target.value)}
              />
            </>
          )}

          {rail === 'bank' && (
            <>
              <Input
                id="bank_name"
                label="Bank"
                defaultValue={account['bank'] ?? ''}
                onBlur={(event) => setAccountField('bank', event.target.value)}
              />
              <Input
                id="bank_branch"
                label="Branch"
                defaultValue={account['branch'] ?? ''}
                onBlur={(event) => setAccountField('branch', event.target.value)}
              />
              <Input
                id="bank_account"
                label="Account number"
                defaultValue={account['account'] ?? ''}
                onBlur={(event) => setAccountField('account', event.target.value)}
              />
              <Input
                id="bank_account_name"
                label="Account name"
                defaultValue={account['account_name'] ?? ''}
                onBlur={(event) => setAccountField('account_name', event.target.value)}
              />
            </>
          )}

          {/*
            The artboard shows a green "matches your permit". Nothing here can
            check that yet — there is no name-lookup provider — and a green
            tick nothing verified would tell a reviewer this had been checked.
          */}
          <div className="border-warning/40 bg-warning-bg flex items-start gap-2.5 rounded-xl border p-3 lg:col-span-1">
            <Shield className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="text-warning text-xs font-bold leading-[1.7]">
              We check this name against your business permit by hand before your first settlement.
              Automatic name lookup is not connected yet.
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------- first 5 items */}
      <div className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[0.9375rem] font-extrabold">Your first five {noun}</h2>
          <p className="text-muted-light text-xs font-semibold">
            A price can wait — the name is what a guest searches for.
          </p>
        </div>

        <ul className="mt-4 space-y-3">
          {items.map((item, index) => (
            <li
              key={index}
              className="border-border bg-surface grid items-end gap-3 rounded-2xl border p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_9rem_auto]"
            >
              <Input
                id={`item_name_${index}`}
                label="Name"
                placeholder="Nyama choma · half kilo"
                value={item.name}
                onChange={(event) => {
                  const next = [...items];
                  const name = event.target.value;
                  next[index] = {
                    ...item,
                    name,
                    contains_alcohol: item.contains_alcohol || ALCOHOL_WORDS.test(name),
                  };
                  setItems(next);
                }}
                onBlur={() => void saveItems()}
              />
              <Input
                id={`item_desc_${index}`}
                label="Description"
                placeholder="Goat · with kachumbari and ugali"
                value={item.description}
                onChange={(event) => {
                  const next = [...items];
                  next[index] = { ...item, description: event.target.value };
                  setItems(next);
                }}
                onBlur={() => void saveItems()}
              />
              <Input
                id={`item_price_${index}`}
                label="Price"
                inputMode="numeric"
                placeholder="KES [—]"
                value={item.price_kes === null ? '' : String(item.price_kes)}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, '');
                  const next = [...items];
                  next[index] = { ...item, price_kes: digits ? Number(digits) : null };
                  setItems(next);
                }}
                onBlur={() => void saveItems()}
              />
              <div className="flex items-center gap-2 pb-1">
                {item.contains_alcohol && (
                  <Chip
                    selected
                    onClick={() => {
                      const next = [...items];
                      next[index] = { ...item, contains_alcohol: false };
                      setItems(next);
                    }}
                  >
                    18+
                  </Chip>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${item.name || 'this row'}`}
                  onClick={() => setItems(items.filter((_, i) => i !== index))}
                  className="text-muted hover:text-danger p-2"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap gap-2">
          <Chip selected={false} onClick={() => setItems([...items, blankItem()])}>
            <span className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add item
            </span>
          </Chip>
          <Chip selected={false} onClick={() => setItems([])}>
            Skip — I will do it in the dashboard
          </Chip>
        </div>
      </div>

      {/* ---------------------------------------------------------- login email */}
      <div className="border-border bg-surface mt-6 rounded-2xl border p-5">
        <p className="text-[0.9375rem] font-extrabold">
          {draft?.contact_email
            ? 'Your login details go to'
            : 'Where should we send your login details?'}
        </p>
        <p className="text-muted mt-1 text-xs font-semibold leading-[1.7]">
          Your weekly statements and a link to set a password go here. You can always sign in with
          your phone number instead.
        </p>
        <div className="mt-3 max-w-sm">
          <Input
            id="login_email"
            type="email"
            label="Email"
            labelHidden
            placeholder="you@yourbusiness.co.ke"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => patch({ contact_email: email || null }, 6)}
          />
        </div>
        <FooterNote>
          Leave it blank and everything comes by phone — you will not get a statement by email.
        </FooterNote>
      </div>
    </OnboardingShell>
  );
}

function blankItem(): Item {
  return { name: '', description: '', price_kes: null, contains_alcohol: false };
}
