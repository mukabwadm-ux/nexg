'use client';

import { CalendarDays, Clock3 } from 'lucide-react';

import { useDraft, useSettings } from './store';
import { Card, SaveBar, Switch, TextLink } from './ui';
import s from './settings.module.css';

export function PreferencesScreen() {
  const { state, savePreferences, identity } = useSettings();
  const { draft, setDraft, dirty, reset } = useDraft(state.preferences);
  return (
    <>
      <div className={s.grid}>
        <Card
          title="Language and regional settings"
          description="Choose how dates, times and language appear across the portal."
        >
          <div className={s.fieldRow}>
            <label htmlFor="language">Language</label>
            <select
              id="language"
              className={s.control}
              value={draft.language}
              onChange={() => setDraft({ ...draft, language: 'English' })}
            >
              <option>English</option>
            </select>
          </div>
          <div className={s.fieldRow}>
            <label htmlFor="date-format">Date format</label>
            <select
              id="date-format"
              className={s.control}
              value={draft.dateFormat}
              onChange={(e) =>
                setDraft({ ...draft, dateFormat: e.target.value as 'long' | 'numeric' })
              }
            >
              <option value="long">1 Nov 2026</option>
              <option value="numeric">01/11/2026</option>
            </select>
          </div>
          <div className={s.fieldRow}>
            <span id="time-format-label">Time format</span>
            <div className={s.segment} role="group" aria-labelledby="time-format-label">
              {(['12', '24'] as const).map((value) => (
                <button
                  key={value}
                  className={draft.timeFormat === value ? s.segmentOn : ''}
                  aria-pressed={draft.timeFormat === value}
                  onClick={() => setDraft({ ...draft, timeFormat: value })}
                >
                  {value}-hour
                </button>
              ))}
            </div>
          </div>
          <div
            className={s.note}
            style={{ background: 'var(--bg)', color: 'var(--ink)', marginTop: 10 }}
          >
            <Clock3 size={24} />
            <div>
              <strong>Kenya time</strong>
              <div className={s.muted}>Africa/Nairobi · EAT</div>
            </div>
            <span className={s.small} style={{ marginLeft: 'auto' }}>
              All merchant times use Kenya time.
            </span>
          </div>
          <hr className={s.divider} />
          <h2>Display</h2>
          <p>Adjust how the portal looks and feels for you.</p>
          <div className={s.fieldRow}>
            <span id="density-label">Density</span>
            <div className={s.segment} role="group" aria-labelledby="density-label">
              {(['Comfortable', 'Compact'] as const).map((value) => (
                <button
                  key={value}
                  className={draft.density === value ? s.segmentOn : ''}
                  aria-pressed={draft.density === value}
                  onClick={() => setDraft({ ...draft, density: value })}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div className={s.fieldRow}>
            <span>Reduce motion</span>
            <span className={s.inline}>
              <Switch
                label="Reduce motion"
                checked={draft.reduceMotion}
                caption={false}
                onChange={(value) => setDraft({ ...draft, reduceMotion: value })}
              />
              <span className={s.small}>Use less animation across the portal.</span>
            </span>
          </div>
        </Card>
        <Card
          title="Your display preview"
          description="This is how dates, times and content will look for you."
        >
          <div className={s.preview}>
            <strong>{draft.dateFormat === 'long' ? 'Sunday, 1 Nov 2026' : '01/11/2026'}</strong>
            <div className={s.previewTime}>
              {draft.timeFormat === '24' ? '14:30' : '2:30 PM'} EAT
            </div>
            <div className={s.inset} style={{ marginTop: 26 }}>
              <span className={s.inline}>
                <CalendarDays size={22} />
                <span>
                  Consultation · {draft.timeFormat === '24' ? '14:30–15:00' : '2:30–3:00 PM'} EAT
                </span>
              </span>
              <span className={s.badge}>Preview</span>
            </div>
          </div>
          <hr className={s.divider} />
          <TextLink href="/merchant/hours">Manage opening hours in Availability</TextLink>
          {!identity.sample && (
            <p className={s.small}>
              Display preferences are saved on this device for your account.
            </p>
          )}
        </Card>
      </div>
      <SaveBar
        dirty={dirty}
        scope="Your account"
        onSave={() => {
          void savePreferences(draft);
        }}
        onCancel={reset}
      />
    </>
  );
}
