/*
 * Office expenses: a "Staff Welfare" category, for things such as staff
 * lunches. Only widens the allowed list on expenses and budgets, so every
 * existing row still passes and nothing else changes.
 */

alter table public.fin_office_expense
  drop constraint fin_office_expense_category_check,
  add constraint fin_office_expense_category_check check (category in (
    'rent_utilities', 'salaries_wages', 'office_supplies', 'transport_travel', 'it_systems',
    'marketing', 'professional_fees', 'repairs_maintenance', 'insurance', 'bank_charges',
    'staff_welfare', 'other'));

alter table public.fin_office_budget
  drop constraint fin_office_budget_category_check,
  add constraint fin_office_budget_category_check check (category in (
    'rent_utilities', 'salaries_wages', 'office_supplies', 'transport_travel', 'it_systems',
    'marketing', 'professional_fees', 'repairs_maintenance', 'insurance', 'bank_charges',
    'staff_welfare', 'other'));
