import 'server-only';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Json } from '@nexg/db';
import { createClient } from '@/lib/supabase/server';
import { HostWorkspaceError, type HostWorkspaceAccess } from './access';

const uuid = z.string().uuid();
const coordinate = z.number().min(0).max(100).optional();
const articleDetails = z.object({
  title: z.string().trim().min(1).max(140),
  room: z.string().trim().max(80).default(''),
  content: z.string().trim().max(3500).default(''),
  steps: z.string().trim().max(3500).default(''),
  media: z
    .union([
      z.literal(''),
      z
        .string()
        .max(800)
        .url()
        .refine((url) => new URL(url).protocol === 'https:'),
    ])
    .optional(),
  caption: z.string().trim().max(1200).optional(),
  x: coordinate,
  y: coordinate,
  markerHeight: coordinate,
});
/*
 * The 3D house (owner, 24 Nov 2026), drawn in the House Builder on the phone: rooms with real sizes in metres, their
 * doors, windows, furniture and amenity pins. Only what would break the builder or bloat the guide is checked here;
 * the builder repairs smaller details itself when it opens a house, and keeps fields it adds over time, so unknown
 * fields pass through. The app keeps the same limits (NEXG STAY src/house/model.ts, HOUSE_LIMITS).
 */
export const maxHouseCharacters = 200_000;
const houseText = (max = 120) => z.string().max(max);
const metres = z.number().finite();
const houseOpening = z
  .object({ id: houseText(), wall: metres, at: metres, width: metres })
  .passthrough();
const houseRoom = z
  .object({
    id: houseText(),
    name: houseText(),
    x: metres,
    y: metres,
    w: z.number().finite().positive().max(50),
    d: z.number().finite().positive().max(50),
    h: metres,
    doors: z.array(houseOpening).max(24),
    windows: z.array(houseOpening).max(24),
    items: z
      .array(z.object({ id: houseText(), preset: houseText(), x: metres, y: metres }).passthrough())
      .max(120),
    pins: z
      .array(
        z
          .object({
            cat: houseText(),
            sub: houseText(),
            x: metres,
            y: metres,
            note: houseText(1000).optional(),
          })
          .passthrough(),
      )
      .max(60),
  })
  .passthrough();
export const houseFile = z
  .object({
    version: z.literal(1),
    name: houseText(),
    rooms: z.array(houseRoom).max(40),
  })
  .passthrough()
  .refine((house) => JSON.stringify(house).length <= maxHouseCharacters, {
    message: 'This 3D house is too large to save.',
  });

export const guideDocument = z.object({
  articles: z.array(articleDetails.extend({ id: uuid })).max(40),
  planId: uuid.nullish(),
  modelId: uuid.nullish(),
  /* A saved house that no longer passes the checks reads as none, so the instructions still load. */
  house: houseFile.nullish().catch(null),
});
export const publishedGuide = z.object({
  unitName: z.string(),
  document: guideDocument,
  publishedAt: z.string(),
});
export const guideCode = /^NXG-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/;
/** The private bucket for guide floor plans and 3D models uploaded straight to Storage. */
export const GUIDE_ASSET_BUCKET = 'host-guide-assets';

export async function requireGuideUnit(
  { db, hostId, unitScope }: HostWorkspaceAccess,
  unitId: string,
) {
  if (unitScope && !unitScope.includes(unitId))
    throw new HostWorkspaceError(403, 'This unit is outside your workspace access.');
  const { data, error } = await db
    .from('unit')
    .select('id')
    .eq('id', unitId)
    .eq('host_id', hostId)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw new HostWorkspaceError(503, 'The guide unit could not be checked.');
  if (!data) throw new HostWorkspaceError(403, 'This unit is outside your workspace access.');
}

export function requireGuideWrite(error: { code: string; message: string } | null) {
  if (!error) return;
  if (error.code === '40001') throw new HostWorkspaceError(409, error.message);
  if (error.code === '42501') throw new HostWorkspaceError(403, error.message);
  if (error.code === '22023') throw new HostWorkspaceError(400, error.message);
  throw new HostWorkspaceError(503, 'The guide update could not be saved.');
}

type GuideCommand = {
  type: string;
  collection?: string;
  id?: string;
  expectedVersion?: number;
  record?: unknown;
};

export async function runGuideCommand(access: HostWorkspaceAccess, command: GuideCommand) {
  const { db } = access;
  const articleEdit = command.collection === 'articles';
  const unitId = articleEdit
    ? z.object({ unitId: uuid }).parse(command.record).unitId
    : uuid.parse(command.id);
  await requireGuideUnit(access, unitId);
  const revision = z.number().int().nonnegative().parse(command.expectedVersion);
  let document: z.infer<typeof guideDocument> | null = null;
  let action = command.type;
  let restoreId: string | null = null;
  const houseEdit = action === 'save-house';
  let houseSaved = false;
  if (articleEdit || houseEdit || action === 'remove-guide-file') {
    const { data, error } = await db
      .from('host_unit_guide')
      .select('document,revision')
      .eq('unit_id', unitId)
      .maybeSingle();
    if (error) throw new HostWorkspaceError(503, 'The guide draft could not be loaded.');
    if ((data?.revision ?? 0) !== revision)
      throw new HostWorkspaceError(409, 'The guide has changed. Reload before saving.');
    document = guideDocument.parse(data?.document ?? { articles: [] });
    if (houseEdit) {
      // The house replaces the draft's house whole; null takes it out of the guide.
      const { house } = z.object({ house: z.unknown() }).parse(command.record);
      if (house === null) document.house = null;
      else {
        const result = houseFile.safeParse(house);
        if (!result.success)
          throw new HostWorkspaceError(
            400,
            result.error.issues.some(
              (issue) => issue.message === 'This 3D house is too large to save.',
            )
              ? 'This 3D house is too large to save. Remove some furniture or rooms.'
              : 'Check the 3D house: a room, door, window, item or amenity is not valid.',
          );
        document.house = result.data;
        houseSaved = true;
      }
    } else if (action === 'remove-guide-file') {
      const { kind } = z.object({ kind: z.enum(['plan', 'model']) }).parse(command.record);
      if (kind === 'plan') document.planId = null;
      else document.modelId = null;
    } else {
      const index = document.articles.findIndex((article) => article.id === command.id);
      if (command.id && index < 0)
        throw new HostWorkspaceError(404, 'This instruction is no longer in the guide.');
      if (action === 'delete') {
        if (index < 0) throw new HostWorkspaceError(400, 'Choose an instruction to remove.');
        document.articles.splice(index, 1);
      } else {
        const details = articleDetails.parse(command.record);
        if (!details.content && !details.steps)
          throw new HostWorkspaceError(400, 'Add instructions or steps guests can follow.');
        if ((details.x === undefined) !== (details.y === undefined))
          throw new HostWorkspaceError(400, 'Set both map coordinates for a marker.');
        const article = { id: command.id ?? randomUUID(), ...details };
        if (index < 0) document.articles.push(article);
        else document.articles[index] = article;
      }
    }
    action = 'draft';
    guideDocument.parse(document);
    // A guide without a house leaves the key out, as guides saved before the 3D house did.
    if (!document.house) delete document.house;
  } else if (action === 'restore') {
    restoreId = z.object({ versionId: uuid }).parse(command.record).versionId;
  }
  /* p_restore_id has no SQL default, so it must always be sent: an undefined
     key is dropped from the request and PostgREST then finds no matching
     function. The generated type says string; null is what non-restore
     actions mean. */
  const { error } = await db.rpc('rpc_host_workspace_guide_commit', {
    p_unit_id: unitId,
    p_revision: revision,
    p_action: action,
    // The house passes unknown builder fields through, which zod types as `unknown`; it is plain JSON either way.
    p_document: document as Json,
    p_restore_id: (restoreId ?? null) as unknown as string,
  });
  requireGuideWrite(error);
  return {
    message: houseEdit
      ? houseSaved
        ? '3D house saved to the guide draft.'
        : '3D house removed from the guide draft.'
      : action === 'draft'
        ? 'Guide draft saved.'
        : action === 'unpublish'
          ? 'Guest guide unpublished.'
          : 'Guest guide published.',
  };
}

export async function readPublishedGuide(code: string) {
  if (!guideCode.test(code)) return null;
  const { data, error } = await createClient().rpc('rpc_host_workspace_published_guide', {
    p_code: code,
  });
  if (error) throw new HostWorkspaceError(503, 'The guest guide is temporarily unavailable.');
  const result = publishedGuide.safeParse(data);
  return result.success ? result.data : null;
}
