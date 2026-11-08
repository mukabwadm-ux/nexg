import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWorkspace } from '../workspace';
import { Avatar, Badge, Button, Empty, Icon, PageHeader, Pager, Panel, Table, Tabs } from '../ui';
import { dateText, money, nextDate } from '../model';
import type { Task } from '../model';
import './operations.css';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
type OperationTab = 'Tasks' | 'Packages' | 'Deliveries' | 'Priority rules' | 'Handoff rules';
const taskStatuses = ['To do', 'In progress', 'Done'];
const iconForTask = (type: string) => /clean|linen|turnover/i.test(type) ? 'cleaning' : /repair|maint/i.test(type) ? 'repair' : /delivery/i.test(type) ? 'delivery' : /package|suppl/i.test(type) ? 'package' : 'task';
const taskTone = (task: Task): Tone => task.status === 'Done' ? 'success' : /urgent|high/i.test(task.priority) ? 'danger' : 'neutral';
const statusTone = (status: string): Tone => /done|placed|delivered|ready|active/i.test(status) ? 'success' : /problem|cancel|failed|urgent/i.test(status) ? 'danger' : /progress|scheduled|pending|clean/i.test(status) ? 'warning' : 'neutral';
const isDone = (task: Task) => ['Done', 'Cancelled', 'Deleted'].includes(task.status);
const short = (text: string, length = 130) => text.length > length ? `${text.slice(0, length).trim()}…` : text;
const pageItems = <T,>(items: T[], page: number, size: number) => items.slice((page - 1) * size, page * size);
const validPage = (page: number, total: number, size: number) => Math.max(1, Math.min(page, Math.ceil(total / size) || 1));
const formatTime = (date: string, zone?: string) => {
  if (!date) return 'Not set';
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime())) return date;
  try { return parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...(zone ? { timeZone: zone } : {}) }); }
  catch { return parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
};
const dueLabel = (date: string, today: string) => !date ? 'No due date' : date.slice(0, 10) === today ? `Today · ${formatTime(date)}` : `${dateText(date)} · ${formatTime(date)}`;

function useDimensions() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => { const update = () => setSize({ width: window.innerWidth, height: window.innerHeight }); window.addEventListener('resize', update); return () => window.removeEventListener('resize', update); }, []);
  return size;
}

function Stat({ icon, value, label, tone }: { icon: string; value: number; label: string; tone?: Tone }) {
  return <Panel className={`nxops-stat ${tone ? `nxops-stat-${tone}` : ''}`}><Icon name={icon} size={23} /><span><strong>{value}</strong> {label}</span></Panel>;
}

export function OperationsPage() {
  const { data, actor, units, go, run, edit, inspect, unitLabel, today, recordId, canEdit, propertyWrites } = useWorkspace();
  const { width, height } = useDimensions();
  const [tab, setTab] = useState<OperationTab>(recordId === 'packages' ? 'Packages' : recordId === 'deliveries' ? 'Deliveries' : recordId === 'handoff' ? 'Handoff rules' : recordId === 'rules' ? 'Priority rules' : 'Tasks');
  const [layout, setLayout] = useState('Board');
  const [mobileColumn, setMobileColumn] = useState('To do');
  const [query, setQuery] = useState('');
  const [unitId, setUnitId] = useState('');
  const [boardPages, setBoardPages] = useState<Record<string, number>>({ 'To do': 1, 'In progress': 1, Done: 1 });
  const [tablePage, setTablePage] = useState(1);
  const [cataloguePage, setCataloguePage] = useState(1);
  const [busyId, setBusyId] = useState('');
  const allowedIds = useMemo(() => new Set(units.map(unit => unit.id)), [units]);
  const canWork = ['Owner', 'Manager', 'Cleaner', 'Caretaker'].includes(actor.role);
  const canServices = ['Owner', 'Manager', 'Caretaker'].includes(actor.role);
  const canManageCatalogue = propertyWrites;
  const boardGridRef = useRef<HTMLDivElement>(null);
  const [taskSize, setTaskSize] = useState(1);
  const rowSize = Math.max(2, Math.min(6, Math.floor((height - 420) / 56)));
  const tasks = useMemo(() => data.tasks.filter(task => (allowedIds.has(task.unitId) || (!task.unitId && !unitId)) && (!unitId || task.unitId === unitId) && !['Cancelled', 'Deleted'].includes(task.status) && (!query || `${task.title} ${unitLabel(task.unitId)} ${task.type}`.toLowerCase().includes(query.toLowerCase()))), [data.tasks, allowedIds, unitId, query, unitLabel]);
  const jobs = data.packageJobs.filter(job => allowedIds.has(job.unitId) && (!unitId || job.unitId === unitId));
  const deliveries = data.deliveries.filter(delivery => allowedIds.has(delivery.unitId) && (!unitId || delivery.unitId === unitId));
  const scopedUnits = units.filter(unit => !unitId || unit.id === unitId);
  const team = data.team.filter(member => member.status === 'Active' && (member.role === 'Owner' || !member.propertyIds.length || scopedUnits.some(unit => member.propertyIds.includes(unit.propertyId))));
  const openTasks = tasks.filter(task => !isDone(task));
  const urgentTasks = openTasks.filter(task => /urgent|high/i.test(task.priority));
  const doneToday = tasks.filter(task => task.status === 'Done' && String(task.updatedAt || task.due).slice(0, 10) === today);
  const turnovers = tasks.filter(task => /clean|turnover/i.test(task.type) && task.due.slice(0, 10) === today);

  useEffect(() => { setTablePage(1); setBoardPages({ 'To do': 1, 'In progress': 1, Done: 1 }); }, [unitId, query, tab, layout]);
  useEffect(() => { if(unitId && !units.some(unit => unit.id === unitId)) setUnitId(''); }, [unitId, units]);
  useLayoutEffect(() => {
    const grid = boardGridRef.current; if (!grid || tab !== 'Tasks' || layout !== 'Board') return;
    const fit = () => { let capacity = 4; const stacks = [...grid.querySelectorAll<HTMLElement>('.nxops-task-stack')]; for (const stack of stacks) { const cards = [...stack.querySelectorAll<HTMLElement>('.nxops-task-card')]; if (!cards.length) continue; const cardHeight = Math.max(...cards.map(card => card.getBoundingClientRect().height)); const gap = parseFloat(getComputedStyle(stack).gap) || 9; capacity = Math.min(capacity, Math.max(1, Math.floor((stack.clientHeight + gap) / (cardHeight + gap)))); } setTaskSize(value => value === capacity ? value : capacity); };
    fit(); const observer = new ResizeObserver(fit); observer.observe(grid); for (const stack of grid.querySelectorAll<HTMLElement>('.nxops-task-stack')) observer.observe(stack); return () => observer.disconnect();
  }, [width, height, tab, layout, unitId, query, mobileColumn, boardPages, tasks.length, taskSize]);
  const createRequest = () => edit('tasks', undefined, { unitId: unitId || units[0]?.id || '', status: 'To do', priority: 'Normal', due: `${today}T14:00`, type: 'other' });
  const createTask = () => edit('tasks', undefined, {
    workspaceTask: true, unitId: unitId || units[0]?.id, type: 'Maintenance',
    assigneeId: actor.id, due: today + 'T14:00', status: 'To do', priority: 'Normal',
  });
  const taskCard = (task: Task) => {
    const member = data.team.find(person => person.id === task.assigneeId);
    const next = task.status === 'In progress' ? 'Done' : task.status === 'Done' ? 'To do' : 'In progress';
    return <article className={`nxops-task-card ${task.status === 'Done' ? 'nxops-task-complete' : ''}`} key={task.id}>
      <div className="nxops-task-heading"><span className={`nxops-task-icon nxops-tone-${taskTone(task)}`}><Icon name={task.status === 'Done' ? 'check' : iconForTask(task.type)} size={21} /></span><button className="nxops-title-button" onClick={() => inspect('tasks', task.id)}><strong>{short(task.title, 54)}</strong><small>{unitLabel(task.unitId)}</small></button>{/urgent|high/i.test(task.priority) && task.status !== 'Done' && <Badge tone="danger">{task.priority}</Badge>}</div>
      <div className="nxops-task-meta"><span>{member ? <Avatar name={member.name} size={24} /> : <Icon name="user" size={16} />}{member?.name || 'Unassigned'}</span><span><Icon name="calendar" size={15} />{dueLabel(task.due, today)}</span></div>
      <div className="nxops-task-actions"><button onClick={() => inspect('tasks', task.id)}>{task.workspaceTask?'View task':'View request'}</button>{canWork && <button onClick={() => task.workspaceTask ? edit('tasks',task.id) : inspect('tasks', task.id)} disabled={busyId === task.id}>{busyId === task.id ? 'Saving…' : next === 'Done' ? 'Complete' : next === 'To do' ? 'Reopen' : 'Start'}<Icon name={next === 'Done' ? 'check' : 'right'} size={14} /></button>}</div>
    </article>;
  };

  const renderBoard = () => <div className="nxops-board-grid" ref={boardGridRef}>{(width < 760 ? [mobileColumn] : taskStatuses).map(status => {
    const column = tasks.filter(task => status === 'To do' ? !['In progress', 'Done'].includes(task.status) : task.status === status);
    const current = validPage(boardPages[status] || 1, column.length, taskSize);
    return <section className={`nxops-board-column ${status === 'Done' ? 'nxops-board-done' : ''}`} key={status}><div className="nxops-column-heading"><h3>{status === 'Done' ? 'Done' : status}</h3><span>{column.length}</span></div><div className="nxops-task-stack">{pageItems(column, current, taskSize).map(taskCard)}{!column.length && <Empty title={status === 'Done' ? 'No completed tasks' : 'Nothing here'} description={status === 'Done' ? 'Completed work will appear here.' : 'Move work here when it is ready.'} />}</div>{column.length > taskSize && <Pager page={current} total={column.length} pageSize={taskSize} onChange={value => setBoardPages(pages => ({ ...pages, [status]: value }))} />}</section>;
  })}</div>;

  const renderList = () => {
    const current = validPage(tablePage, tasks.length, rowSize);
    return <><Table><thead><tr><th>Task</th><th>Home</th><th>Assignee</th><th>Due</th><th>Status</th><th /></tr></thead><tbody>{pageItems(tasks, current, rowSize).map(task => <tr key={task.id}><td><button className="nxops-row-link" onClick={() => inspect('tasks', task.id)}>{task.title}</button><small>{task.type} · {task.priority}</small></td><td>{unitLabel(task.unitId)}</td><td>{data.team.find(member => member.id === task.assigneeId)?.name || 'Unassigned'}</td><td>{dueLabel(task.due, today)}</td><td><Badge tone={statusTone(task.status)}>{task.status}</Badge></td><td><Button variant="ghost" onClick={() => inspect('tasks', task.id)}>Edit</Button></td></tr>)}</tbody></Table>{!tasks.length && <Empty title="No matching tasks" description="Try another home or search." />}<Pager page={current} total={tasks.length} pageSize={rowSize} onChange={setTablePage} /></>;
  };

  const renderTeamSchedule = () => {
    const current = validPage(tablePage, team.length, rowSize);
    return <><Table><thead><tr><th>Team member</th><th>Role</th><th>Assigned work</th><th>Next due</th><th /></tr></thead><tbody>{pageItems(team, current, rowSize).map(member => { const assigned = openTasks.filter(task => task.assigneeId === member.id).sort((a, b) => a.due.localeCompare(b.due)); return <tr key={member.id}><td><div className="nxops-person"><Avatar name={member.name} size={29} /><strong>{member.name}</strong></div></td><td>{member.role}</td><td>{assigned.length} open {assigned.length === 1 ? 'task' : 'tasks'}</td><td>{assigned[0] ? dueLabel(assigned[0].due, today) : 'No work due'}</td><td>{assigned[0]&&<Button variant="ghost" onClick={()=>inspect('tasks',assigned[0].id)}>View request</Button>}</td></tr>; })}</tbody></Table><Pager page={current} total={team.length} pageSize={rowSize} onChange={setTablePage} /></>;
  };

  const renderPackages = () => {
    const catalogueSize = width < 760 ? 1 : 2;
    const current = validPage(cataloguePage,data.packages.length,catalogueSize);
    const jobSize = Math.max(2,rowSize-1);
    const jobsPage = validPage(tablePage,jobs.length,jobSize);
    return <div className="nxops-service-page">
      <div className="nxops-section-heading"><div><h2>Package catalogue</h2><p>Choose what NexG should place before check-in.</p></div>
        {canManageCatalogue&&<Button onClick={()=>edit('packages')}><Icon name="add" size={16}/>Create package</Button>}
      </div>
      <div className="nxops-catalogue">{pageItems(data.packages,current,catalogueSize).map(item=><Panel className="nxops-package-card" key={item.id}>
        <span className="nxops-task-icon"><Icon name="package" size={24}/></span><div className="nxops-package-copy">
          <h3>{item.title}</h3><p>{short(item.items,135)}</p><div className="nxops-package-price">
            <strong>{item.priced===false?'Price on request':money(item.amountMinor,data.settings.currency)}</strong><span>{item.leadHours}h lead time</span></div>
        </div><div className="nxops-package-actions">
          {canServices&&units.length>0&&<Button variant="primary" onClick={()=>edit('packageJobs',undefined,{packageId:item.id,unitId:unitId||units[0]?.id,due:nextDate(today,1)+'T'+data.settings.checkIn})}>Schedule</Button>}
          {canEdit('packages',item.id)&&<><Button variant="ghost" onClick={()=>edit('packages',item.id)}>Edit</Button>
          <Button variant="ghost" disabled={busyId===item.id} onClick={async()=>{
            if(!window.confirm('Archive this package? Existing placements stay on record.'))return;
            setBusyId(item.id);
            try{await run({type:'delete',collection:'packages',id:item.id});}finally{setBusyId('');}
          }}>Archive</Button></>}
        </div>
      </Panel>)}</div>
      {!data.packages.length&&<Empty title="No packages available" description="Create a package for your workspace."/>}
      <Pager page={current} total={data.packages.length} pageSize={catalogueSize} onChange={setCataloguePage}/>
      <Panel className="nxops-table-panel"><div className="nxops-section-heading"><h2>Package placements</h2><span>Billing follows placement.</span></div>
        <Table><thead><tr><th>Package</th><th>Unit</th><th>Check-in</th><th>State</th><th>Proof</th><th/></tr></thead>
          <tbody>{pageItems(jobs,jobsPage,jobSize).map(job=><tr key={job.id}>
            <td><strong>{String(job.title||'Welcome package')}</strong><small>{String(job.reference||'')}</small></td><td>{unitLabel(job.unitId)}</td>
            <td>{dueLabel(job.due,today)}</td><td><Badge tone={statusTone(job.status)}>{job.status}</Badge></td>
            <td>{job.hasPhoto?'Photo on record':'Pending'}</td><td><Button onClick={()=>inspect('packageJobs',job.id)}>View</Button></td>
          </tr>)}</tbody>
        </Table>
        {!jobs.length&&<p className="nxops-muted">No placements in this property view.</p>}
        <Pager page={jobsPage} total={jobs.length} pageSize={jobSize} onChange={setTablePage}/>
      </Panel>
    </div>;
  };

  const renderPriorityRules = () => <Panel className="nxops-table-panel">
    <div className="nxops-section-heading"><h2>Request priority rules</h2><span>Response targets used by NexG and your host team.</span></div>
    <Table><thead><tr><th>Priority</th><th>Response target</th></tr></thead>
      <tbody>{data.priorityRules.map(rule=><tr key={rule.id}><td>{rule.title}</td><td>{String(rule.minutes)} minutes</td></tr>)}</tbody>
    </Table>
    {!data.priorityRules.length&&<p className="nxops-muted">NexG defaults apply for this workspace.</p>}
  </Panel>;

  const renderHandoffs = () => {
    const current=validPage(tablePage,scopedUnits.length,rowSize);
    return <Panel className="nxops-table-panel">
      <div className="nxops-section-heading"><h2>Delivery handoff rules</h2><span>Rules are stored per unit.</span></div>
      <Table><thead><tr><th>Unit</th><th>Handoff rule</th><th>Contact</th><th>Delivery hours</th><th/></tr></thead>
        <tbody>{pageItems(scopedUnits,current,rowSize).map(unit=><tr key={unit.id}>
          <td>{unitLabel(unit.id)}</td><td>{unit.deliveryRule||'Set a rule'}<small>{String(unit.handoffNote||'')}</small></td>
          <td>{unit.contact||'—'}</td><td>{unit.hours||'—'}</td>
          <td><Button onClick={()=>edit('units',unit.id)}>Edit handoff</Button></td>
        </tr>)}</tbody>
      </Table>
      <Pager page={current} total={scopedUnits.length} pageSize={rowSize} onChange={setTablePage}/>
    </Panel>;
  };

  const renderDeliveries = () => {
    const current = validPage(tablePage, deliveries.length, rowSize);
    return <Panel className="nxops-table-panel nxops-delivery-panel"><div className="nxops-section-heading"><div><h2>Deliveries & handoffs</h2><p>Keep the original handoff instruction and record any agreed exception.</p></div></div><Table><thead><tr><th>Delivery</th><th>Home & handoff</th><th>Stage</th><th>Evidence</th><th>Actions</th></tr></thead><tbody>{pageItems(deliveries, current, rowSize).map(delivery => { return <tr key={delivery.id}><td><button className="nxops-row-link" onClick={() => inspect('deliveries', delivery.id)}>{delivery.title}</button><small>{delivery.reference || delivery.id}</small></td><td><button className="nxops-row-link" onClick={() => go('unit', delivery.unitId)}>{unitLabel(delivery.unitId)}</button><small>{short(delivery.rule, 72)}</small></td><td><Badge tone={statusTone(delivery.stage)}>{delivery.stage}</Badge>{delivery.issue && <small>{short(delivery.issue, 60)}</small>}</td><td>{delivery.hasProof ? <Badge tone="success">On file</Badge> : <span className="nxops-muted">Not added</span>}</td><td><div className="nxops-table-actions"><Button variant="ghost" onClick={() => inspect('deliveries', delivery.id)}>Details</Button></div></td></tr>; })}</tbody></Table>{!deliveries.length && <Empty title="No deliveries in this view" description="Deliveries appear with their unit and handoff context." />}<Pager page={current} total={deliveries.length} pageSize={rowSize} onChange={setTablePage} /><div className="nxops-callout"><Icon name="delivery" size={20} /><p>Changing a home’s rule affects later deliveries. Record updates to an existing delivery explicitly, with its evidence.</p></div></Panel>;
  };

  return <div className={`nxops-page nxops-operations ${height < 740 ? 'nxops-compact-height' : ''}`}><PageHeader title="Operations" subtitle="Keep every stay ready."><div className="nxops-header-controls"><label className="nxops-unit-select"><span className="sr-only">Filter by home</span><select value={unitId} onChange={event => setUnitId(event.target.value)}><option value="">All homes</option>{units.map(unit => <option value={unit.id} key={unit.id}>{unitLabel(unit.id)}</option>)}</select></label>{canWork && <><Button onClick={createRequest}>Create request</Button><Button variant="primary" disabled={!units.length} onClick={createTask}><Icon name="add" size={18} />Create task</Button></>}</div></PageHeader><div className="nxops-stat-grid"><Stat icon="task" value={openTasks.length} label="open tasks and requests" /><Stat icon="notification" value={urgentTasks.length} label="need attention" tone="warning" /><Stat icon="cleaning" value={turnovers.length} label="turnovers today" /><Stat icon="check" value={doneToday.length} label="completed today" tone="success" /></div><div className="nxops-main-tabs"><Tabs items={['Tasks', 'Packages', 'Deliveries']} value={tab} onChange={value => setTab(value as OperationTab)} />{tab === 'Tasks' && <label className="nxops-search"><Icon name="search" size={16} /><input placeholder="Find a task…" aria-label="Find a task" value={query} onChange={event => setQuery(event.target.value)} /></label>}</div>{tab === 'Tasks' ? <div className="nxops-work-layout"><Panel className="nxops-board-panel"><div className="nxops-view-tabs"><Tabs items={['Board', 'List', 'Team schedule']} value={layout} onChange={setLayout} /></div>{layout === 'Board' && width < 760 && <Tabs items={taskStatuses} value={mobileColumn} onChange={setMobileColumn} />}{layout === 'Board' ? renderBoard() : layout === 'List' ? renderList() : renderTeamSchedule()}</Panel><aside className="nxops-work-aside"><Panel className="nxops-team-panel"><div className="nxops-section-heading"><h2>Today’s team</h2>{['Owner', 'Manager'].includes(actor.role) && <button className="nxops-text-link" onClick={() => go('settings', 'team')}>Manage</button>}</div>{team.slice(0, 3).map(member => <div className="nxops-team-person" key={member.id}><Avatar name={member.name} size={38} /><div><strong>{member.name}</strong><small>{member.role}</small></div><Badge tone="warning">{openTasks.filter(task => task.assigneeId === member.id).length} tasks</Badge></div>)}{!team.length && <p className="nxops-muted">No assigned team members.</p>}</Panel><Panel className="nxops-readiness-panel"><h2>Unit readiness</h2>{[{ label: 'ready', pattern: /^ready$/i, icon: 'check', tone: 'success' }, { label: 'cleaning', pattern: /clean/i, icon: 'cleaning', tone: 'warning' }, { label: 'maintenance', pattern: /maint|service|repair/i, icon: 'repair', tone: 'danger' }].map(item => <div className="nxops-readiness-row" key={item.label}><span className={`nxops-task-icon nxops-tone-${item.tone}`}><Icon name={item.icon} size={22} /></span><strong>{scopedUnits.filter(unit => item.pattern.test(unit.readiness)).length}</strong><span>{item.label}</span></div>)}</Panel></aside></div> : tab === 'Packages' ? renderPackages() : tab === 'Priority rules' ? renderPriorityRules() : tab === 'Handoff rules' ? renderHandoffs() : renderDeliveries()}<div className="nxops-operations-footer"><Button onClick={()=>setTab('Priority rules')}>Priority rules</Button><Button variant="secondary" onClick={() => { setTab('Handoff rules'); setTablePage(1); }}><Icon name="delivery" size={18} />Delivery handoff rules<Icon name="right" size={16} /></Button><Button variant="secondary" onClick={() => { setTab('Packages'); setCataloguePage(1); }}><Icon name="package" size={18} />Package catalogue<Icon name="right" size={16} /></Button>{tab === 'Tasks' && <span>{tasks.length} tasks across {scopedUnits.length} homes</span>}</div></div>;
}

interface HelpArticle { id: string; category: string; title: string; summary: string; steps: string[]; page: string; action: string; }
const helpCategories = [
  { title: 'Getting started', description: 'Set up your workspace and first property', icon: 'add' },
  { title: 'Properties & units', description: 'Manage homes, units and their details', icon: 'home' },
  { title: 'Reservations & calendar', description: 'Manage availability and stay details', icon: 'calendar' },
  { title: 'Guest guides & QR', description: 'Create clear instructions for every stay', icon: 'qr' },
  { title: 'Cleaning & maintenance', description: 'Assign work and keep units ready', icon: 'cleaning' },
  { title: 'Payments & reports', description: 'Record money and understand performance', icon: 'money' },
];
const helpArticles: HelpArticle[] = [
  { id: 'first-property', category: 'Getting started', title: 'Add a property and its units', summary: 'Start with a property, then add each bookable home.', steps: ['Open Properties and choose Add property. Give it a recognisable name and location.', 'Add a unit for each separately bookable home or room. Set capacity, nightly price and check-in times.', 'Save a draft while you finish the guide, access details and readiness. Review the unit before making it available.'], page: 'properties', action: 'Open properties' },
  { id: 'workspace-team', category: 'Getting started', title: 'Preview team access', summary: 'Choose the information each role should see.', steps: ['Open Settings and choose Team. Add the person’s name and email.', 'Choose a role and the properties they may access. Review the scope before saving.', 'Change or revoke the example access later. These choices stay in this preview; no invitation is sent.'], page: 'settings', action: 'Open settings' },
  { id: 'unit-details', category: 'Properties & units', title: 'Update unit details', summary: 'Keep photos, capacity, price and contacts accurate.', steps: ['Open Properties, choose a property, then select the unit.', 'Use Edit to update photos, capacity, prices and operating details.', 'Review your saved changes and any existing stays affected by them. A detail change does not replace a confirmed booking.'], page: 'properties', action: 'Open properties' },
  { id: 'delivery-rules', category: 'Properties & units', title: 'Set delivery handoff instructions', summary: 'Tell the team where to leave an order and who can accept it.', steps: ['Open the unit and review its delivery instruction, contact and accepting hours.', 'Use one clear instruction. Check that the contact can carry it out during those hours.', 'Existing deliveries retain their original rule. Record any agreed exception on the delivery itself.'], page: 'properties', action: 'Open properties' },
  { id: 'reservation-create', category: 'Reservations & calendar', title: 'Create or change a reservation', summary: 'Check the unit and dates before confirming the stay.', steps: ['Open Calendar and choose Add reservation. Select the unit and dates.', 'Enter the guest, stay type and agreed price. The system checks for conflicting stays and blocked dates.', 'Save the reservation. Use its record to change dates, move the guest, extend or cancel while retaining its history.'], page: 'calendar', action: 'Open calendar' },
  { id: 'calendar-block', category: 'Reservations & calendar', title: 'Block dates for owner use or repairs', summary: 'Protect availability without deleting a unit.', steps: ['Open Calendar and add a block for the unit and date range.', 'Select a reason such as owner use or maintenance. The final date is the first available day after the block.', 'Resolve any stay conflict first. Release the block when the unit can accept new reservations.'], page: 'calendar', action: 'Open calendar' },
  { id: 'guide-map', category: 'Guest guides & QR', title: 'Set up amenity instructions and a unit map', summary: 'Connect useful instructions to the right room and object.', steps: ['Open a unit’s guest guide. Add an amenity, room, short instructions and any approved photos or captions.', 'Place the amenity on the unit map. The text list provides the same information for people who do not use the map.', 'Preview and publish the guide in this browser. Keep private access notes out of general articles and QR destinations.'], page: 'properties', action: 'Open properties' },
  { id: 'guide-share', category: 'Guest guides & QR', title: 'Share a published guide and QR card', summary: 'Let guests find information without exposing private records.', steps: ['Publish the unit guide before sharing it.', 'Create a QR card for a named physical spot and mark it placed. Check its destination before using it.', 'Retire a lost or replaced card. A general unit link must not expose reservation-private information or permanent access codes.'], page: 'properties', action: 'Open properties' },
  { id: 'cleaning-task', category: 'Cleaning & maintenance', title: 'Assign a cleaning task', summary: 'Make the due time, checklist and responsible person clear.', steps: ['Open Operations and choose Create task. Select Cleaning, its unit and an assignee.', 'Set the due time and checklist. Add inspection or recurring work where appropriate.', 'Record completed checklist items and photo evidence before marking the task Done. Follow-up inspections remain separate work.'], page: 'operations', action: 'Open operations' },
  { id: 'maintenance', category: 'Cleaning & maintenance', title: 'Record and resolve a maintenance issue', summary: 'Keep the problem, evidence and outcome together.', steps: ['Create a Maintenance task from Operations or the relevant unit.', 'Describe the fault, assign someone, set its priority and add evidence. Block unavailable dates when necessary.', 'Record the repair and inspection result before completing it. Reopen the task if the problem returns.'], page: 'operations', action: 'Open operations' },
  { id: 'record-money', category: 'Payments & reports', title: 'Record a payment or refundable deposit', summary: 'Keep accommodation, deposits and other money separate.', steps: ['Open Finances and select the related reservation.', 'Choose the appropriate receipt, refund or deposit type. Record its amount, date, reference and status.', 'A manual record is not bank confirmation. Review recorded receipts, pending amounts and refundable deposits separately.'], page: 'finances', action: 'Open finances' },
  { id: 'owner-statement', category: 'Payments & reports', title: 'Export an owner statement', summary: 'Review the selected period before sharing a report.', steps: ['Open Reports and choose the property, unit and period you need.', 'Check accommodation income, costs, balances and deposit treatment. Guest merchant orders are a separate category.', 'Export the available statement format. Confirm the period and currency on the exported file before sharing it.'], page: 'reports', action: 'Open reports' },
];

export function HelpPage() {
  const { data, go } = useWorkspace();
  const { width, height } = useDimensions();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [articleId, setArticleId] = useState('');
  const [page, setPage] = useState(1);
  const [stepPage, setStepPage] = useState(1);
  const article = helpArticles.find(item => item.id === articleId);
  const searchResults = helpArticles.filter(item => (!category || item.category === category) && (!query || `${item.title} ${item.summary} ${item.category} ${item.steps.join(' ')}`.toLowerCase().includes(query.toLowerCase())));
  const resultSize = width < 760 ? 3 : height < 740 ? 3 : 5;
  const current = validPage(page, searchResults.length, resultSize);
  const openArticle = (id: string) => { setArticleId(id); setStepPage(1); };
  const support = () => go('inbox', 'new');
  useEffect(() => { setPage(1); setArticleId(''); }, [query, category]);
  const back = () => { if (articleId) setArticleId(''); else { setCategory(''); setQuery(''); } };

  return <div className={`nxops-page nxops-help-page ${height < 740 ? 'nxops-compact-height' : ''}`}><PageHeader title="Help center" subtitle="Guides and support for your workspace.">{(category || article) && <Button variant="ghost" onClick={back}><Icon name="left" size={17} />{article ? 'Back to articles' : 'All categories'}</Button>}</PageHeader>{!article && <section className="nxops-help-search"><h2>How can we help?</h2><label className="nxops-search"><Icon name="search" size={20} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search help articles…" aria-label="Search help articles" /></label><p>Popular: add a unit, share a guest guide, record a payment</p></section>}{article ? <Panel className="nxops-article"><div className="nxops-article-eyebrow"><Icon name="book" size={20} />{article.category}</div><h2>{article.title}</h2><p className="nxops-article-summary">{article.summary}</p><ol start={(stepPage - 1) * 2 + 1}>{pageItems(article.steps, stepPage, 2).map((step, index) => <li key={index}>{step}</li>)}</ol><Pager page={stepPage} total={article.steps.length} pageSize={2} onChange={setStepPage} /><div className="nxops-article-actions"><Button variant="primary" onClick={() => go(article.page)}>{article.action}<Icon name="right" size={17} /></Button><Button variant="secondary" onClick={support}>Ask for help</Button></div></Panel> : query || category ? <Panel className="nxops-help-results"><div className="nxops-section-heading"><h2>{category || 'Search results'}</h2><span>{searchResults.length} articles</span></div>{pageItems(searchResults, current, resultSize).map(item => <button className="nxops-guide-row" key={item.id} onClick={() => openArticle(item.id)}><Icon name="book" size={21} /><span><strong>{item.title}</strong><small>{item.summary}</small></span><Icon name="right" size={18} /></button>)}{!searchResults.length && <Empty title="No matching articles" description="Try a shorter phrase or ask host support." />}<Pager page={current} total={searchResults.length} pageSize={resultSize} onChange={setPage} /></Panel> : <><div className="nxops-help-categories">{helpCategories.map(item => <button className="nxops-help-category" key={item.title} onClick={() => setCategory(item.title)}><Icon name={item.icon} size={32} /><span><strong>{item.title}</strong><small>{item.description}</small><span className="nxops-help-count">{helpArticles.filter(article => article.category === item.title).length} articles</span></span><Icon name="right" size={17} /></button>)}</div><div className="nxops-help-lower"><Panel className="nxops-popular-guides"><h2>Popular guides</h2>{['first-property', 'guide-map', 'cleaning-task', 'owner-statement'].slice(0, height < 740 ? 2 : 4).map(id => { const item = helpArticles.find(article => article.id === id)!; return <button key={id} className="nxops-guide-row" onClick={() => openArticle(id)}><Icon name="book" size={19} /><strong>{item.title}</strong><Icon name="right" size={17} /></button>; })}</Panel><Panel className="nxops-help-contact"><h2>Need a hand?</h2><p>Send NexG support a message and follow the reply in your Inbox.</p><Button variant="primary" onClick={support}><Icon name="message" size={19} />Start support conversation</Button><Button variant="secondary" onClick={() => go('support-tickets')}>View your requests</Button></Panel></div></>}<footer className="nxops-help-footer"><span><Icon name="calendar" size={16} />{String(data.settings.supportHours || 'Support hours are shown in your workspace settings')}{data.settings.supportHours ? ` · ${data.settings.timezone}` : ''}</span><button className="nxops-text-link" onClick={() => go('inbox', 'new')}>View contact options<Icon name="right" size={15} /></button></footer></div>;
}
