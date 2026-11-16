'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * Company's writes. Thin on purpose: who may do what, what must be true
 * first, and the audit entry all live in the rpc_company_* functions, so
 * they hold whether a change comes from this console or anywhere else.
 */

export interface Outcome {
  ok: boolean;
  message?: string;
  id?: string;
}

function done(error: { message: string } | null, message?: string, id?: string): Outcome {
  if (error) return { ok: false, message: error.message };
  return { ok: true, message, id };
}

function refresh(...paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

/* ───────────────────────────────────────────────────────────── folders */

export async function saveFolder(input: {
  id?: string | null;
  name: string;
  color?: string;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_company_folder_save', {
    p_name: input.name,
    p_color: input.color,
    p_id: input.id ?? undefined,
  });
  refresh('/company/files');
  return done(error, input.id ? 'Folder renamed' : 'Folder added', data ?? undefined);
}

export async function deleteFolder(id: string): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_company_folder_delete', { p_id: id });
  refresh('/company/files');
  return done(error, 'Folder deleted');
}

/* ─────────────────────────────────────────────────────────────── files */

export async function registerFile(input: {
  path: string;
  name: string;
  folderId: string | null;
  visibility: 'company' | 'private';
  description?: string;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_company_file_add', {
    p_path: input.path,
    p_name: input.name,
    p_folder_id: input.folderId ?? undefined,
    p_visibility: input.visibility,
    p_description: input.description || undefined,
  });
  refresh('/company/files');
  return done(error, 'Uploaded', data ?? undefined);
}

export async function updateFile(input: {
  id: string;
  name: string;
  folderId: string | null;
  visibility: 'company' | 'private';
  description?: string;
}): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_company_file_update', {
    p_id: input.id,
    p_name: input.name,
    p_folder_id: input.folderId ?? undefined,
    p_visibility: input.visibility,
    p_description: input.description || undefined,
  });
  refresh('/company/files');
  return done(error, 'File updated');
}

export async function shareFile(id: string, staffIds: string[]): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_company_file_share', {
    p_id: id,
    p_staff_ids: staffIds,
  });
  refresh('/company/files');
  return done(
    error,
    data === 0
      ? 'No longer shared with anyone'
      : `Shared with ${data} ${data === 1 ? 'colleague' : 'colleagues'}`,
  );
}

export async function trashFile(id: string, trash = true): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_company_file_trash', {
    p_id: id,
    p_trash: trash,
  });
  refresh('/company/files');
  return done(error, trash ? 'Moved to the trash' : 'Restored');
}

/** Deletes a file for good: the record first, then the stored object. */
export async function purgeFile(id: string): Promise<Outcome> {
  const supabase = createClient();
  const { data: path, error } = await supabase.rpc('rpc_company_file_purge', { p_id: id });
  if (error) return done(error);
  if (path) {
    /* The object is an orphan now; storage lets a Company writer remove it.
       If this fails the file is still gone from Company, and the object
       is cleaned up with the next orphan sweep. */
    await supabase.storage.from('company-files').remove([path]);
  }
  refresh('/company/files');
  return { ok: true, message: 'Deleted for good' };
}

export async function starFile(id: string, starred: boolean): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_company_file_star', {
    p_id: id,
    p_starred: starred,
  });
  refresh('/company/files');
  return done(error, starred ? 'Starred' : 'Star removed');
}

/** Removes an upload that could not be registered, so it does not linger. */
export async function discardUpload(path: string): Promise<void> {
  await createClient().storage.from('company-files').remove([path]);
}

/**
 * A link to open or download a file, good for one minute. Storage signs it
 * only for somebody who may see the file, so a link copied out of the page
 * stops working almost at once.
 */
export async function fileLink(id: string, download: boolean): Promise<Outcome & { url?: string }> {
  const supabase = createClient();
  const { data: file } = await supabase
    .from('company_file')
    .select('storage_path, name')
    .eq('id', id)
    .maybeSingle();
  if (!file) return { ok: false, message: 'That file is not there any more.' };
  const { data, error } = await supabase.storage
    .from('company-files')
    .createSignedUrl(file.storage_path, 60, download ? { download: file.name } : undefined);
  if (error || !data) {
    return { ok: false, message: error?.message ?? 'The file could not be opened.' };
  }
  return { ok: true, url: data.signedUrl };
}

/* ─────────────────────────────────────────────────────────── locations */

export interface LocationInput {
  id?: string | null;
  name: string;
  kind: string;
  cityId: string | null;
  address: string;
  managerId: string | null;
  phone: string;
  notes: string;
}

export async function saveLocation(input: LocationInput): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_company_location_save', {
    p_name: input.name,
    p_kind: input.kind,
    p_city_id: input.cityId ?? undefined,
    p_address: input.address || undefined,
    p_manager_id: input.managerId ?? undefined,
    p_phone: input.phone || undefined,
    p_notes: input.notes || undefined,
    p_id: input.id ?? undefined,
  });
  refresh('/company/warehouses', '/company/inventory');
  return done(error, input.id ? 'Location updated' : 'Location added', data ?? undefined);
}

export async function setLocationActive(
  id: string,
  active: boolean,
  reason: string,
): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_company_location_set_active', {
    p_id: id,
    p_active: active,
    p_reason: reason || undefined,
  });
  refresh('/company/warehouses', '/company/inventory');
  return done(error, active ? 'Location reopened' : 'Location closed');
}

/* ───────────────────────────────────────────────────────────── vendors */

export interface VendorInput {
  id?: string | null;
  name: string;
  categories: string[];
  contactName: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  cityId: string | null;
  taxPin: string;
  paymentTerms: string;
  rating: number | null;
  notes: string;
}

export async function saveVendor(input: VendorInput): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_company_vendor_save', {
    p_name: input.name,
    p_categories: input.categories,
    p_contact_name: input.contactName || undefined,
    p_email: input.email || undefined,
    p_phone: input.phone || undefined,
    p_website: input.website || undefined,
    p_address: input.address || undefined,
    p_city_id: input.cityId ?? undefined,
    p_tax_pin: input.taxPin || undefined,
    p_payment_terms: input.paymentTerms,
    p_rating: input.rating ?? undefined,
    p_notes: input.notes || undefined,
    p_id: input.id ?? undefined,
  });
  refresh('/company/vendors', '/company/procurement');
  return done(error, input.id ? 'Vendor updated' : 'Vendor added', data ?? undefined);
}

export async function setVendorStatus(
  id: string,
  status: 'active' | 'on_hold' | 'archived',
  reason: string,
): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_company_vendor_set_status', {
    p_id: id,
    p_status: status,
    p_reason: reason || undefined,
  });
  refresh('/company/vendors', '/company/procurement');
  return done(
    error,
    status === 'active' ? 'Vendor is active' : status === 'on_hold' ? 'Vendor on hold' : 'Archived',
  );
}

/* ──────────────────────────────────────────────────────────── inventory */

export async function saveCategory(input: { name: string; icon: string }): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_company_category_save', {
    p_name: input.name,
    p_icon: input.icon,
  });
  refresh('/company/inventory', '/company/assets');
  return done(error, 'Category added', data ?? undefined);
}

export interface ItemInput {
  id?: string | null;
  name: string;
  categoryId: string;
  sku: string;
  unit: string;
  unitCostCents: number;
  reorderLevel: number;
  vendorId: string | null;
  description: string;
  photoPath: string | null;
  locationId: string | null;
  openingQuantity: number;
}

export async function saveItem(input: ItemInput): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_company_item_save', {
    p_name: input.name,
    p_category_id: input.categoryId,
    p_sku: input.sku || undefined,
    p_unit: input.unit,
    p_unit_cost_cents: input.unitCostCents,
    p_reorder_level: input.reorderLevel,
    p_vendor_id: input.vendorId ?? undefined,
    p_description: input.description || undefined,
    p_photo_path: input.photoPath ?? undefined,
    p_location_id: input.locationId ?? undefined,
    p_opening_quantity: input.openingQuantity,
    p_id: input.id ?? undefined,
  });
  refresh('/company/inventory', '/company/warehouses');
  return done(error, input.id ? 'Item updated' : 'Item added', data ?? undefined);
}

export async function archiveItem(id: string, archived: boolean): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_company_item_archive', {
    p_id: id,
    p_archived: archived,
  });
  refresh('/company/inventory', '/company/warehouses');
  return done(error, archived ? 'Item archived' : 'Item restored');
}

export async function moveStock(input: {
  itemId: string;
  kind: 'in' | 'out' | 'transfer';
  quantity: number;
  fromLocationId: string | null;
  toLocationId: string | null;
  unitCostCents: number | null;
  reason: string | null;
  note: string;
}): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_company_stock_move', {
    p_item_id: input.itemId,
    p_kind: input.kind,
    p_quantity: input.quantity,
    p_from_location_id: input.fromLocationId ?? undefined,
    p_to_location_id: input.toLocationId ?? undefined,
    p_unit_cost_cents: input.unitCostCents ?? undefined,
    p_reason: input.reason ?? undefined,
    p_note: input.note || undefined,
  });
  refresh('/company/inventory', '/company/warehouses');
  return done(
    error,
    input.kind === 'in' ? 'Stock received' : input.kind === 'out' ? 'Stock issued' : 'Stock moved',
  );
}

export async function countStock(input: {
  itemId: string;
  locationId: string;
  counted: number;
  note: string;
}): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_company_stock_count', {
    p_item_id: input.itemId,
    p_location_id: input.locationId,
    p_counted: input.counted,
    p_note: input.note || undefined,
  });
  refresh('/company/inventory', '/company/warehouses');
  return done(error, 'Count recorded');
}

/* ─────────────────────────────────────────────────────────────── assets */

export interface AssetInput {
  id?: string | null;
  name: string;
  categoryId: string;
  brand: string;
  model: string;
  serialNumber: string;
  locationId: string | null;
  condition: string;
  purchaseDate: string | null;
  purchaseCostCents: number | null;
  vendorId: string | null;
  warrantyUntil: string | null;
  nextServiceOn: string | null;
  photoPath: string | null;
  notes: string;
}

export async function saveAsset(input: AssetInput): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_company_asset_save', {
    p_name: input.name,
    p_category_id: input.categoryId,
    p_brand: input.brand || undefined,
    p_model: input.model || undefined,
    p_serial_number: input.serialNumber || undefined,
    p_location_id: input.locationId ?? undefined,
    p_condition: input.condition,
    p_purchase_date: input.purchaseDate ?? undefined,
    p_purchase_cost_cents: input.purchaseCostCents ?? undefined,
    p_vendor_id: input.vendorId ?? undefined,
    p_warranty_until: input.warrantyUntil ?? undefined,
    p_next_service_on: input.nextServiceOn ?? undefined,
    p_photo_path: input.photoPath ?? undefined,
    p_notes: input.notes || undefined,
    p_id: input.id ?? undefined,
  });
  refresh('/company/assets', '/company/inventory', '/company/warehouses');
  return done(error, input.id ? 'Asset updated' : 'Asset registered', data ?? undefined);
}

export async function assignAsset(input: {
  id: string;
  staffId: string | null;
  assigneeName: string;
  note: string;
}): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_company_asset_assign', {
    p_id: input.id,
    p_staff_id: input.staffId ?? undefined,
    p_assignee_name: input.staffId ? undefined : input.assigneeName || undefined,
    p_note: input.note || undefined,
  });
  refresh('/company/assets', '/company/inventory');
  return done(error, 'Handed over');
}

export async function returnAsset(input: {
  id: string;
  condition: string | null;
  note: string;
}): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_company_asset_return', {
    p_id: input.id,
    p_condition: input.condition ?? undefined,
    p_note: input.note || undefined,
  });
  refresh('/company/assets', '/company/inventory');
  return done(error, 'Handed back');
}

export async function maintainAsset(input: {
  id: string;
  step: 'schedule' | 'start' | 'complete';
  dueOn: string | null;
  costCents: number | null;
  condition: string | null;
  note: string;
}): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_company_asset_maintenance', {
    p_id: input.id,
    p_step: input.step,
    p_due_on: input.dueOn ?? undefined,
    p_cost_cents: input.costCents ?? undefined,
    p_condition: input.condition ?? undefined,
    p_note: input.note || undefined,
  });
  refresh('/company/assets', '/company/inventory');
  return done(
    error,
    input.step === 'schedule'
      ? 'Service scheduled'
      : input.step === 'start'
        ? 'In for maintenance'
        : 'Back from maintenance',
  );
}

export async function setAssetStatus(
  id: string,
  status: 'retired' | 'lost' | 'available',
  reason: string,
): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_company_asset_set_status', {
    p_id: id,
    p_status: status,
    p_reason: reason,
  });
  refresh('/company/assets', '/company/inventory');
  return done(
    error,
    status === 'retired' ? 'Retired' : status === 'lost' ? 'Reported lost' : 'Back in use',
  );
}

/* ───────────────────────────────────────────────────────── procurement */

export interface PurchaseLineInput {
  itemId: string | null;
  description: string;
  quantity: number;
  unitCostCents: number;
}

export interface PurchaseInput {
  id?: string | null;
  title: string;
  justification: string;
  department: string;
  priority: string;
  neededBy: string | null;
  vendorId: string | null;
  locationId: string | null;
  lines: PurchaseLineInput[];
  submit: boolean;
}

export async function savePurchase(input: PurchaseInput): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_company_purchase_save', {
    p_title: input.title,
    p_lines: input.lines.map((l) => ({
      item_id: l.itemId,
      description: l.description,
      quantity: l.quantity,
      unit_cost_cents: l.unitCostCents,
    })),
    p_justification: input.justification || undefined,
    p_department: input.department,
    p_priority: input.priority,
    p_needed_by: input.neededBy ?? undefined,
    p_vendor_id: input.vendorId ?? undefined,
    p_location_id: input.locationId ?? undefined,
    p_submit: input.submit,
    p_id: input.id ?? undefined,
  });
  refresh('/company/procurement');
  return done(error, input.submit ? 'Sent for approval' : 'Draft saved', data ?? undefined);
}

export async function submitPurchase(id: string): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_company_purchase_submit', { p_id: id });
  refresh('/company/procurement');
  return done(error, 'Sent for approval');
}

export async function decidePurchase(id: string, approve: boolean, note: string): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_company_purchase_decide', {
    p_id: id,
    p_approve: approve,
    p_note: note || undefined,
  });
  refresh('/company/procurement');
  return done(error, approve ? 'Approved' : 'Turned down');
}

export async function cancelPurchase(id: string, reason: string): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_company_purchase_cancel', {
    p_id: id,
    p_reason: reason || undefined,
  });
  refresh('/company/procurement');
  return done(error, 'Request cancelled');
}

export async function issueOrder(input: {
  requestId: string;
  vendorId: string | null;
  locationId: string | null;
  expectedOn: string | null;
  notes: string;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_company_po_issue', {
    p_request_id: input.requestId,
    p_vendor_id: input.vendorId ?? undefined,
    p_location_id: input.locationId ?? undefined,
    p_expected_on: input.expectedOn ?? undefined,
    p_notes: input.notes || undefined,
  });
  refresh('/company/procurement', '/company/vendors');
  return done(error, 'Purchase order raised', data ?? undefined);
}

export async function receiveOrder(
  id: string,
  lines: { lineId: string; quantity: number }[],
  note: string,
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_company_po_receive', {
    p_po_id: id,
    p_lines: lines.map((l) => ({ line_id: l.lineId, quantity: l.quantity })),
    p_note: note || undefined,
  });
  refresh('/company/procurement', '/company/inventory', '/company/warehouses', '/company/vendors');
  return done(error, data === 'received' ? 'Everything has arrived' : 'Delivery recorded');
}

export async function cancelOrder(id: string, reason: string): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_company_po_cancel', {
    p_po_id: id,
    p_reason: reason,
  });
  refresh('/company/procurement', '/company/vendors');
  return done(error, 'Purchase order cancelled');
}
