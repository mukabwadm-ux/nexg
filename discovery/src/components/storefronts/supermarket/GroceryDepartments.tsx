import { Sparkles } from 'lucide-react';
import type { CatalogDepartment, CatalogNaming, CatalogSection } from '../../../data/catalogSections';
import { sectionAnchor } from '../../../data/catalogSections';
import { departmentIcon } from './departmentIcons';

/** The store's home, as the first row of the department list. */
export const DISCOVER = 'discover';

/**
 * A retail store's departments (owner, 9 Nov 2026: Bolt Food's sidebar in Wolt Market's look). On laptops a
 * sticky sidebar: "Discover" (the store's home) first, then one row per department with its round tinted
 * icon tile, its name and how many products it holds; the open one is a soft gold pill. Under "Discover",
 * the history sections ("Frequently ordered", "New") appear only when real history exists. On phones the
 * same list is one horizontal row of round tiles with labels, as on Uber Eats (supermarket.css).
 */
export function GroceryDepartments({ departments, history, active, naming, onSelect, onHistory }: {
  departments: readonly CatalogDepartment[];
  /** History sections shown on the store's home; empty until real history exists. */
  history: readonly CatalogSection[];
  /** DISCOVER or a department id. */
  active: string;
  naming: CatalogNaming;
  onSelect: (id: string) => void;
  onHistory: (section: CatalogSection) => void;
}) {
  const home = active === DISCOVER;
  return <nav className="grocery-departments" aria-label="Departments">
    <ul className="grocery-departments__list">
      <li>
        <button type="button" className="grocery-department grocery-department--discover" aria-current={home ? 'true' : undefined} onClick={() => onSelect(DISCOVER)}>
          <span className="grocery-department__tile"><Sparkles size={20} strokeWidth={1.75} aria-hidden="true" /></span>
          <span className="grocery-department__title">Discover</span>
        </button>
        {home && history.length > 0 && <ul className="grocery-department__subs">
          {history.map((section) => <li key={section.id}>
            <a href={`#${sectionAnchor(section)}`} onClick={(event) => { event.preventDefault(); onHistory(section); }}>{section.title}</a>
          </li>)}
        </ul>}
      </li>
      {departments.map((department) => {
        const Icon = departmentIcon(department.icon);
        return <li key={department.id}>
          <button type="button" className="grocery-department" aria-current={active === department.id ? 'true' : undefined} onClick={() => onSelect(department.id)}>
            <span className="grocery-department__tile">
              {department.image ? <img src={department.image} alt="" width={40} height={40} loading="lazy" decoding="async" /> : <Icon size={20} strokeWidth={1.75} aria-hidden="true" />}
            </span>
            <span className="grocery-department__title">{department.title}</span>
            <span className="grocery-department__count"><span className="sr-only">, </span>{department.count}<span className="sr-only"> {department.count === 1 ? naming.item : naming.items}</span></span>
          </button>
        </li>;
      })}
    </ul>
  </nav>;
}
