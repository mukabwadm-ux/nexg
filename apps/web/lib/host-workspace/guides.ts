import 'server-only';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
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
export const guideDocument = z.object({
  articles: z.array(articleDetails.extend({ id: uuid })).max(40),
  planId: uuid.nullish(),
  modelId: uuid.nullish(),
});
export const publishedGuide = z.object({
  unitName: z.string(),
  document: guideDocument,
  publishedAt: z.string(),
});
export const guideCode = /^NXG-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/;

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
  if (articleEdit || action === 'remove-guide-file') {
    const { data, error } = await db
      .from('host_unit_guide')
      .select('document,revision')
      .eq('unit_id', unitId)
      .maybeSingle();
    if (error) throw new HostWorkspaceError(503, 'The guide draft could not be loaded.');
    if ((data?.revision ?? 0) !== revision)
      throw new HostWorkspaceError(409, 'The guide has changed. Reload before saving.');
    document = guideDocument.parse(data?.document ?? { articles: [] });
    if (action === 'remove-guide-file') {
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
  } else if (action === 'restore') {
    restoreId = z.object({ versionId: uuid }).parse(command.record).versionId;
  }
  const { error } = await db.rpc('rpc_host_workspace_guide_commit', {
    p_unit_id: unitId,
    p_revision: revision,
    p_action: action,
    p_document: document,
    p_restore_id: restoreId ?? undefined,
  });
  requireGuideWrite(error);
  return {
    message:
      action === 'draft'
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
