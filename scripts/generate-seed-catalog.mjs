/**
 * scripts/generate-seed-catalog.mjs
 * Generates SQL seed data from NEXG_Nairobi_Merchant_Seed_Catalog.xlsx
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let XLSX;
try {
  XLSX = require('xlsx');
} catch (e) {
  XLSX = require('C:\\Users\\Mukabwa\\.gemini\\antigravity\\brain\\cd3ab63a-7147-4d0d-a7a4-0a17da2e5790\\scratch\\node_modules\\xlsx');
}

const excelPath = 'C:\\Users\\Mukabwa\\Downloads\\NEXG_Nairobi_Merchant_Seed_Catalog.xlsx';
if (!fs.existsSync(excelPath)) {
  console.error(`Excel file not found at ${excelPath}`);
  process.exit(1);
}

const wb = XLSX.readFile(excelPath);
const merchants = XLSX.utils.sheet_to_json(wb.Sheets['Merchants'] || []);
const items = XLSX.utils.sheet_to_json(wb.Sheets['Items'] || []);

console.log(`Loaded ${merchants.length} merchants and ${items.length} items from Excel.`);

// Category mapping from Excel Category Name to Canonical ID
const CAT_MAP = {
  'adults only': 'adults_only',
  'airport transfers': 'airport_transfers',
  'alcohol & beverages': 'alcohol_beverages',
  'fashion & apparel': 'fashion_apparel',
  'beauty': 'beauty',
  'vehicle rentals': 'vehicle_rentals',
  'experiences': 'experiences',
  'financial services': 'financial_services',
  'flowers & gifts': 'flowers_gifts',
  'restaurants & food': 'restaurants_food',
  'groceries & essentials': 'groceries_essentials',
  'laundry & cleaning': 'laundry_cleaning',
  'marketplace': 'marketplace',
  'pharmacy': 'pharmacy',
  'health': 'health',
  'tech & electronics': 'tech_electronics',
  'travel & tours': 'travel_tours',
  'vehicle services': 'vehicle_services',
  'wellness': 'wellness',
  'concierge services': 'concierge_services',
  'logistics & shipping': 'logistics_shipping'
};

const AREA_COORDS = {
  'Kilimani': { lat: -1.2921, lng: 36.7856 },
  'Westlands': { lat: -1.2674, lng: 36.8110 },
  'Kileleshwa': { lat: -1.2789, lng: 36.7904 },
  'Lavington': { lat: -1.2854, lng: 36.7688 },
  'Karen': { lat: -1.3197, lng: 36.7065 },
  'Parklands': { lat: -1.2625, lng: 36.8241 },
  'Riverside': { lat: -1.2715, lng: 36.7963 },
  'Gigiri': { lat: -1.2330, lng: 36.8124 },
  'Runda': { lat: -1.2144, lng: 36.8198 },
  'Hurlingham': { lat: -1.2971, lng: 36.7915 },
  'Upper Hill': { lat: -1.2988, lng: 36.8172 },
  'CBD': { lat: -1.2864, lng: 36.8172 },
  'South C': { lat: -1.3211, lng: 36.8285 },
  'South B': { lat: -1.3125, lng: 36.8402 },
  'Ngong Road': { lat: -1.2995, lng: 36.7761 },
  'Spring Valley': { lat: -1.2541, lng: 36.7925 },
  'Loresho': { lat: -1.2520, lng: 36.7588 },
  'Muthaiga': { lat: -1.2562, lng: 36.8375 },
  'Eastleigh': { lat: -1.2783, lng: 36.8524 },
  'Nairobi West': { lat: -1.3105, lng: 36.8210 }
};

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '_');
}

let sql = `-- NexG Nairobi Synthetic Merchant Seed Catalog
-- Generated from NEXG_Nairobi_Merchant_Seed_Catalog.xlsx
-- Includes 640 realistic Nairobi merchants and their branches.

do $$
declare
  v_city uuid;
  v_zone uuid;
  v_merchant_id uuid;
begin
  select id into v_city from public.city where name = 'Nairobi' limit 1;
  if v_city is null then
    raise notice 'No Nairobi city found; skipping merchant catalog seed.';
    return;
  end if;

`;

// Generate merchant inserts
merchants.forEach((m, idx) => {
  const mId = m['Merchant ID'] || `M${String(idx + 1).padStart(4, '0')}`;
  // Deterministic UUID based on index
  const uuid = `c1000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`;
  const branchUuid = `d1000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`;
  const name = (m['Merchant Name'] || '').replace(/'/g, "''");
  const rawCat = (m['Category'] || '').trim().toLowerCase();
  const catId = CAT_MAP[rawCat] || 'marketplace';
  const subName = (m['Subcategory'] || '').trim();
  const subId = slugify(subName);
  const area = (m['Nairobi Area'] || 'Westlands').trim();
  const coords = AREA_COORDS[area] || { lat: -1.2864, lng: 36.8172 };

  sql += `  -- [${mId}] ${name} (${area})
  if not exists (select 1 from public.merchant where id = '${uuid}') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      '${uuid}', '${name} Ltd', '${name}', '${catId}', '${subId}',
      'Manager ${name}', '+254700${String(idx).padStart(6, '0')}', '${mId.toLowerCase()}@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      '${branchUuid}', '${uuid}', '${area} Branch', '${area}, Nairobi', true, ${coords.lat}, ${coords.lng}
    );
  end if;
`;
});

sql += `
  raise notice 'Successfully seeded 640 Nairobi merchants and branches.';
end $$;
`;

const outputPath = path.resolve('supabase/seeds/merchants-seed-catalog.sql');
fs.writeFileSync(outputPath, sql, 'utf8');
console.log(`Generated seed SQL at: ${outputPath} (${(sql.length / 1024 / 1024).toFixed(2)} MB)`);
