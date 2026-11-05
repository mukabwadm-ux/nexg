-- Initial Activities, Games & Sports configuration from the shared taxonomy.
insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort, color, bg, description,
  subcategories, featured_eligible, requires_ops_mapping
) values (
  'activities_games_sports', 'Activities, Games & Sports', 'Trophy', 'services', 'turnaround', 22,
  '#0f766e', '#f0fdfa', 'Indoor games, outdoor sports, adrenaline activities and swimming.',
  $activities$
[
  {
    "id": "bowling",
    "name": "Bowling",
    "icon": "CircleDot",
    "group": "Indoor",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SPACE_RESERVATION",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a venue and time → check space and party limits → confirm reservation → check in"
  },
  {
    "id": "arcade_games",
    "name": "Arcade & timed play",
    "icon": "Gamepad2",
    "group": "Indoor",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SESSION_CAPACITY",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a dated session → check places and eligibility → confirm booking → check in"
  },
  {
    "id": "escape_rooms",
    "name": "Escape rooms",
    "icon": "KeyRound",
    "group": "Indoor",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SPACE_RESERVATION",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a venue and time → check space and party limits → confirm reservation → check in"
  },
  {
    "id": "indoor_courts",
    "name": "Indoor sports courts",
    "icon": "Trophy",
    "group": "Indoor",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SPACE_RESERVATION",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a venue and time → check space and party limits → confirm reservation → check in"
  },
  {
    "id": "outdoor_courts",
    "name": "Outdoor sports courts",
    "icon": "Trophy",
    "group": "Outdoor",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SPACE_RESERVATION",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a venue and time → check space and party limits → confirm reservation → check in"
  },
  {
    "id": "football_pitches",
    "name": "Football pitches",
    "icon": "Goal",
    "group": "Outdoor",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SPACE_RESERVATION",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a venue and time → check space and party limits → confirm reservation → check in"
  },
  {
    "id": "outdoor_team_games",
    "name": "Outdoor team games",
    "icon": "Trees",
    "group": "Outdoor",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SESSION_CAPACITY",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a dated session → check places and eligibility → confirm booking → check in"
  },
  {
    "id": "go_karting",
    "name": "Go-karting",
    "icon": "Flag",
    "group": "Adrenaline",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SESSION_CAPACITY",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a dated session → check places and eligibility → confirm booking → check in"
  },
  {
    "id": "paintball",
    "name": "Paintball",
    "icon": "Target",
    "group": "Adrenaline",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SESSION_CAPACITY",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a dated session → check places and eligibility → confirm booking → check in"
  },
  {
    "id": "ziplining",
    "name": "Ziplining & high ropes",
    "icon": "Mountain",
    "group": "Adrenaline",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "REQUEST_QUOTE",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Send activity requirements → operator reviews eligibility and conditions → accept quote → confirm with operator"
  },
  {
    "id": "swimming_sessions",
    "name": "Public swim sessions",
    "icon": "Waves",
    "group": "Swimming",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SESSION_CAPACITY",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a dated session → check places and eligibility → confirm booking → check in"
  },
  {
    "id": "swimming_lessons",
    "name": "Swimming lessons",
    "icon": "Waves",
    "group": "Swimming",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "APPOINTMENT",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a lesson → check instructor and pool availability → confirm appointment → attend"
  },
  {
    "id": "pool_lane_hire",
    "name": "Pool lane hire",
    "icon": "Waves",
    "group": "Swimming",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SPACE_RESERVATION",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a venue and time → check space and party limits → confirm reservation → check in"
  }
]
  $activities$::jsonb,
  true, true
)
on conflict (category) do nothing;
