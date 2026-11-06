import 'server-only';

import { z } from 'zod';
import { HostWorkspaceError, type HostWorkspaceAccess } from './access';

const lines = z.string().max(4000).transform(value =>
  [...new Set(value.split(/\r?\n/).map(line => line.trim()).filter(Boolean))]
).refine(items => items.length <= 40, 'Use up to 40 checklist items.');
const uuid = z.string().uuid();
const optionalId = z.union([uuid, z.literal('')]).transform(value => value || null);
const time = z.string().regex(/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d$/)
  .refine(value => z.string().date().safeParse(value.slice(0, 10)).success);
const task = z.object({
  unitId: uuid, stayId: optionalId, assigneeId: optionalId,
  title: z.string().trim().min(1).max(120),
  type: z.enum(['Cleaning', 'Inspection', 'Maintenance', 'Guest request']),
  due: time,
  priority: z.enum(['Normal', 'High', 'Urgent']),
  status: z.enum(['To do', 'In progress', 'Done', 'Cancelled']),
  checklist: lines, completedChecks: lines,
  evidence: z.string().max(333000).refine(value => !value || /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/]+=*$/.test(value)),
  comments: z.string().trim().max(3000),
  cadence: z.enum(['None', 'Weekly', 'Monthly']),
  inspection: z.boolean(),
}).partial();

export async function saveWorkspaceTask(
  { db, hostId, unitScope }: HostWorkspaceAccess,
  { id, expectedVersion, record }: { id?: string; expectedVersion?: number; record: unknown },
  zone: string,
) {
  const data = task.parse(record);
  const taskId = id ?? z.object({ operationId: uuid }).parse(record).operationId;
  let unitId = data.unitId;
  if (id) {
    if (expectedVersion === undefined) throw new HostWorkspaceError(409, 'Reload this task before saving changes.');
    const { data: previous, error } = await db.from('host_workspace_task').select('unit_id').eq('id', id).maybeSingle();
    if (error) throw new HostWorkspaceError(503, 'This task could not be loaded.');
    if (!previous || (unitId && unitId !== previous.unit_id))
      throw new HostWorkspaceError(403, 'Edit the task in its original unit.');
    unitId = previous.unit_id;
  } else if (!data.unitId || !data.title || !data.type || !data.due) {
    throw new HostWorkspaceError(400, 'Add a title, unit, task type and due date.');
  }
  if (!unitId || (unitScope && !unitScope.includes(unitId)))
    throw new HostWorkspaceError(403, 'This task is outside your workspace access.');
  const { data: unit, error: unitError } = await db.from('unit').select('id')
    .eq('id', unitId).eq('host_id', hostId).is('archived_at', null).maybeSingle();
  if (unitError) throw new HostWorkspaceError(503, 'The task unit could not be loaded.');
  if (!unit) throw new HostWorkspaceError(403, 'This task is outside your workspace access.');
  const { error } = await db.rpc('rpc_host_workspace_task_save', {
    p_id: taskId, p_unit_id: unitId, p_version: expectedVersion,
    p_patch: {
      stay_id: data.stayId, assignee_id: data.assigneeId, title: data.title, kind: data.type,
      due_at: data.due ? data.due.replace('T', ' ') + ':00 ' + zone : undefined,
      priority: data.priority, status: data.status, checklist: data.checklist, completed_checks: data.completedChecks,
      evidence: data.evidence, comments: data.comments, cadence: data.cadence, inspection: data.inspection,
    },
  });
  if (error) {
    if (error.code === '40001') throw new HostWorkspaceError(409, error.message);
    if (error.code === '42501') throw new HostWorkspaceError(403, error.message);
    if (error.code === '22023') throw new HostWorkspaceError(400, error.message);
    if (error.code === '23514') throw new HostWorkspaceError(400, 'Check the task checklist and completion evidence.');
    throw new HostWorkspaceError(503, 'The task could not be saved.');
  }
  return { message: data.status === 'Done' ? 'Task completed.' : 'Task saved.' };
}
