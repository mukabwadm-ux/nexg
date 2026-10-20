'use client';

import { Button, Card, Input, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { changeEmail, changePassword, setAvatarPath, updateProfile } from '@/app/account/actions';
import { createClient } from '@/lib/supabase/client';

export interface MyProfile {
  staff_id: string;
  email: string;
  display_name: string;
  phone: string | null;
  job_title: string | null;
  bio: string | null;
  timezone: string;
  avatar_path: string | null;
}

const ZONES = [
  'Africa/Nairobi',
  'Africa/Kampala',
  'Africa/Dar_es_Salaam',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Europe/London',
  'UTC',
];

const MAX_BYTES = 2 * 1024 * 1024;

export function ProfileForms({
  profile,
  avatarUrl,
  userId,
  emailDomain,
  roleLabel,
}: {
  profile: MyProfile;
  avatarUrl: string | null;
  userId: string;
  emailDomain: string | null;
  roleLabel: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const report = (r: { ok: boolean; message: string }) => {
    toast({
      title: r.ok ? 'Done' : 'Not saved',
      description: r.message,
      tone: r.ok ? 'success' : 'danger',
    });
    if (r.ok) router.refresh();
  };

  const submit =
    (key: string, action: (f: FormData) => Promise<{ ok: boolean; message: string }>) =>
    async (formData: FormData) => {
      setBusy(key);
      const r = await action(formData);
      setBusy(null);
      report(r);
    };

  const upload = async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      report({ ok: false, message: 'Use a JPG, PNG or WebP image.' });
      return;
    }
    if (file.size > MAX_BYTES) {
      report({ ok: false, message: 'Keep the photo under 2 MB.' });
      return;
    }
    setBusy('photo');
    const path = `${userId}/${crypto.randomUUID()}`;
    const { error } = await createClient().storage.from('staff-avatars').upload(path, file, {
      contentType: file.type,
    });
    if (error) {
      setBusy(null);
      report({ ok: false, message: error.message });
      return;
    }
    const r = await setAvatarPath(path);
    setBusy(null);
    report(r);
  };

  const initials = profile.display_name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-8">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-5">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
            <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <span
              aria-hidden="true"
              className="bg-gold text-ink flex h-20 w-20 items-center justify-center rounded-full text-xl font-extrabold"
            >
              {initials || '—'}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[1.0625rem] font-extrabold">{profile.display_name}</p>
            <p className="text-muted text-xs font-semibold">
              {profile.job_title ? `${profile.job_title} · ` : ''}
              {roleLabel}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                  e.target.value = '';
                }}
              />
              <Button
                size="sm"
                variant="outline"
                loading={busy === 'photo'}
                onClick={() => fileRef.current?.click()}
              >
                {avatarUrl ? 'Change photo' : 'Add a photo'}
              </Button>
              {avatarUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === 'photo'}
                  onClick={async () => {
                    setBusy('photo');
                    const r = await setAvatarPath(null);
                    setBusy(null);
                    report(r);
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
            <p className="text-muted-light mt-2 text-xs font-semibold">
              JPG, PNG or WebP, up to 2 MB. Colleagues on staff can see it.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-[0.9375rem] font-extrabold">About you</h2>
        <form action={submit('profile', updateProfile)} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="display_name"
              name="display_name"
              label="Full name"
              defaultValue={profile.display_name}
              required
            />
            <Input
              id="job_title"
              name="job_title"
              label="Job title"
              defaultValue={profile.job_title ?? ''}
              maxLength={80}
            />
            <Input
              id="phone"
              name="phone"
              type="tel"
              label="Work phone"
              defaultValue={profile.phone ?? ''}
              maxLength={30}
            />
            <label className="block">
              <span className="text-[0.8125rem] font-bold">Time zone</span>
              <select
                name="timezone"
                defaultValue={profile.timezone}
                className="border-border-strong bg-bg mt-1.5 w-full rounded-lg border px-3 py-2.5 text-[0.875rem] font-semibold"
              >
                {(ZONES.includes(profile.timezone) ? ZONES : [profile.timezone, ...ZONES]).map(
                  (z) => (
                    <option key={z} value={z}>
                      {z.replace('_', ' ')}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-[0.8125rem] font-bold">Short bio</span>
            <textarea
              name="bio"
              rows={3}
              maxLength={500}
              defaultValue={profile.bio ?? ''}
              className="border-border-strong bg-bg mt-1.5 w-full rounded-lg border px-3 py-2.5 text-[0.875rem] font-semibold"
            />
          </label>
          <Button type="submit" loading={busy === 'profile'} loadingText="Saving…">
            Save profile
          </Button>
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="text-[0.9375rem] font-extrabold">Sign-in email</h2>
        <p className="text-muted mt-1 text-xs font-semibold leading-[1.7]">
          Currently <strong>{profile.email}</strong>.{' '}
          {emailDomain ? `It must be an @${emailDomain} address. ` : ''}
          No confirmation email is sent, so your password proves it is you. Role and city scope do
          not change.
        </p>
        <form action={submit('email', changeEmail)} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input id="email" name="email" type="email" label="New email" required />
          <Input
            id="email_password"
            name="password"
            type="password"
            label="Current password"
            autoComplete="current-password"
            required
          />
          <div className="sm:col-span-2">
            <Button type="submit" variant="outline" loading={busy === 'email'}>
              Change email
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="text-[0.9375rem] font-extrabold">Password</h2>
        <form
          action={submit('password', changePassword)}
          className="mt-4 grid gap-4 sm:grid-cols-3"
        >
          <Input
            id="current"
            name="current"
            type="password"
            label="Current password"
            autoComplete="current-password"
            required
          />
          <Input
            id="next"
            name="next"
            type="password"
            label="New password"
            autoComplete="new-password"
            minLength={10}
            required
          />
          <Input
            id="confirm"
            name="confirm"
            type="password"
            label="Repeat new password"
            autoComplete="new-password"
            minLength={10}
            required
          />
          <div className="sm:col-span-3">
            <Button type="submit" variant="outline" loading={busy === 'password'}>
              Change password
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
