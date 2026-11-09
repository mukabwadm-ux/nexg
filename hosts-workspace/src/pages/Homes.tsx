import {useState,useEffect} from 'react';

function useWidth(){const [w,setW]=useState(window.innerWidth);useEffect(()=>{const f=()=>setW(window.innerWidth);window.addEventListener('resize',f);return()=>window.removeEventListener('resize',f)},[]);return w;}

import {useWorkspace} from '../workspace';
import {useMobile} from '../use-mobile';

import {Button,Icon,Panel,Tabs,Metric,Badge,Avatar,PageHeader,Table,Empty,Pager,PropertyPhoto,downloadFile,csv} from '../ui';

import {money,dateText,activeStay,totals,nights,type Stay} from '../model';

import {UnitGuideEditor, UnitGuideHistory} from './UnitGuide';

import {PropertiesNavigation,propertySectionLabel,propertySectionSlug} from '../property-navigation';

const inHouse=(s:Stay,today:string)=>s.status==='Checked in'||(activeStay(s)&&s.start<today&&s.end>today);

function overviewDateKey(date:Date,timeZone:string){const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);const part=(type:string)=>parts.find(value=>value.type===type)?.value||'';return `${part('year')}-${part('month')}-${part('day')}`;}

function calendarWeekStart(date:string){const day=new Date(date+'T12:00:00Z').getUTCDay();return addDay(date,-((day+6)%7));}

function overviewGuest(name:string){const parts=name.trim().split(/\s+/);return parts.length>1?`${parts[0]} ${Array.from(parts[parts.length-1])[0]}.`:parts[0]||'Guest';}

function overviewTime(value:string){const match=/^(\d{1,2}):(\d{2})/.exec(value||'15:00');if(!match)return value||'3:00 PM';const hour=Number(match[1]);return `${hour%12||12}:${match[2]} ${hour<12?'AM':'PM'}`;}

function overviewWeekLabel(start:string){const end=addDay(start,6),first=new Date(start+'T12:00:00Z'),last=new Date(end+'T12:00:00Z');if(first.getUTCFullYear()===last.getUTCFullYear()&&first.getUTCMonth()===last.getUTCMonth())return `${first.getUTCDate()}\u2013${last.getUTCDate()} ${last.toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'})}`;if(first.getUTCFullYear()===last.getUTCFullYear())return `${dateText(start)}\u2013${dateText(end)} ${last.getUTCFullYear()}`;return `${dateText(start)} ${first.getUTCFullYear()}\u2013${dateText(end)} ${last.getUTCFullYear()}`;}

export function OverviewPage(){

 const width=useWidth(),cardSize=width<=800?1:3,attentionLimit=width<=360?1:2;

 const w=useWorkspace(),[clock,setClock]=useState(()=>new Date()),[activity,setActivity]=useState('Arrivals'),[page,setPage]=useState(1),[attentionPage,setAttentionPage]=useState(1),[unitPage,setUnitPage]=useState(1);

 const timeZone=w.data.settings.timezone||'Africa/Nairobi',today=overviewDateKey(clock,timeZone),currentWeek=calendarWeekStart(today);

 const [calendarStart,setCalendarStart]=useState(()=>currentWeek);

 useEffect(()=>{const timer=window.setInterval(()=>setClock(new Date()),60000);return()=>window.clearInterval(timer);},[]);

 const arrivals=w.stays.filter(stay=>stay.start===today&&activeStay(stay)),departures=w.stays.filter(stay=>stay.end===today&&!['Cancelled','Draft','Hold'].includes(stay.status)),occupied=w.stays.filter(stay=>activeStay(stay)&&stay.start<=today&&stay.end>today);

 const occupiedUnitCount=new Set(occupied.map(stay=>stay.unitId)).size,scopedUnitCount=w.units.length,occupancyPercent=scopedUnitCount?occupiedUnitCount/scopedUnitCount*100:0;
 const tasks=w.data.tasks.filter(task=>w.units.some(unit=>unit.id===task.unitId)&&!['Done','Cancelled'].includes(task.status)),attention=tasks.filter(task=>task.priority==='Urgent'||!task.assigneeId);

 const financial=totals({...w.data,stays:w.stays,payments:w.data.payments.filter(payment=>w.stays.some(stay=>stay.id===payment.stayId)&&payment.date>=addDay(today,-29)&&payment.date<=today)});

 const activities=[{name:'Arrivals',records:arrivals},{name:'Departures',records:departures},{name:'In-house',records:occupied}],list=activities.find(item=>item.name===activity)?.records||arrivals;

 const activityPage=Math.max(1,Math.min(page,Math.ceil(list.length/cardSize)||1)),attentionCurrentPage=Math.max(1,Math.min(attentionPage,Math.ceil(attention.length/attentionLimit)||1));

 const unitPages=Math.max(1,Math.ceil(w.units.length/4)),visibleUnitPage=Math.min(unitPage,unitPages),weekOptions=[...new Set([...Array.from({length:9},(_,index)=>addDay(currentWeek,(index-4)*7)),calendarStart])].sort();

 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone,hour:'numeric',hourCycle:'h23'}).format(clock)),greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening',owner=w.actor.name.trim().split(/\s+/)[0]||'Alex';

 return <div className="overview-page">

  <div className="page-header overview-header"><div className="overview-heading"><p className="overview-date">{new Intl.DateTimeFormat('en-GB',{timeZone,weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(clock)}</p><h1>{greeting}, {owner}</h1></div><div className="page-actions"><PropertyScope/><Button onClick={()=>w.go('setup')}>Setup &amp; readiness</Button><Button variant="primary" onClick={()=>w.edit('stays')}><Icon name="add"/>Add reservation</Button></div></div>

  <div className="metrics-grid"><Metric label="Accommodation receipts" value={money(financial.receipts)} note="Last 30 days" spark/><Metric label="Occupied tonight" value={`${occupiedUnitCount} / ${scopedUnitCount}`} note={<><span>Across {w.scope==='all'?w.data.properties.length:1} properties</span><span className="occupancy-donut" role="meter" aria-label="Occupied units tonight" aria-valuemin={0} aria-valuenow={occupiedUnitCount} aria-valuemax={scopedUnitCount} aria-valuetext={`${occupiedUnitCount} of ${scopedUnitCount} units occupied`} title={`${occupiedUnitCount}/${scopedUnitCount}`} style={{background:`conic-gradient(var(--gold) ${occupancyPercent}%,var(--line) 0)`}}><b>{Math.round(occupancyPercent)}%</b></span></>} icon="bed"/><Metric label="Arrivals today" value={arrivals.length} icon="calendar" note="Open a stay to check readiness"/><Metric label="Open tasks" value={tasks.length} icon="task" note={<Badge tone="warning">{attention.length} need attention</Badge>}/></div>

  <div className="overview-middle"><Panel className="overview-calendar"><div className="panel-heading"><div className="mini-calendar-title"><h2>Booking calendar</h2><span className="calendar-period">{calendarStart===currentWeek?'This week':'Selected week'}</span></div><div className="mini-calendar-controls"><Button variant="ghost" aria-label="Previous calendar week" onClick={()=>setCalendarStart(addDay(calendarStart,-7))}><Icon name="left" size={16}/></Button><select className="mini-week-label" aria-label="Select calendar week" value={calendarStart} onChange={event=>setCalendarStart(event.target.value)}>{weekOptions.map(week=><option key={week} value={week}>{overviewWeekLabel(week)}</option>)}</select><Button variant="ghost" aria-label="Next calendar week" onClick={()=>setCalendarStart(addDay(calendarStart,7))}><Icon name="right" size={16}/></Button><Button onClick={()=>w.go('calendar')}><Icon name="calendar" size={17}/>View calendar</Button></div></div><CalendarGrid compact start={calendarStart} unitPage={visibleUnitPage}/><div className="calendar-legend"><span><i className="legend-gold"/>Confirmed</span><span><i className="legend-blue"/>Checked in</span><span><i className="legend-grey"/>Blocked</span><span><Icon name="cleaning" size={16}/>Cleaning</span>{unitPages>1&&<select className="mini-unit-range" aria-label="Calendar unit rows" value={visibleUnitPage} onChange={event=>setUnitPage(Number(event.target.value))}>{Array.from({length:unitPages},(_,index)=><option key={index+1} value={index+1}>Units {index*4+1}&ndash;{Math.min((index+1)*4,w.units.length)}</option>)}</select>}</div></Panel>

   <Panel className={'attention-panel'+(!attention.length?' attention-clear':'')}><div className="panel-heading"><div className="attention-heading-title"><h2>Needs attention</h2><Badge tone="warning">{attention.length}</Badge></div></div>{attention.slice((attentionCurrentPage-1)*attentionLimit,attentionCurrentPage*attentionLimit).map(task=><div className="attention-item" key={task.id}><span className={`attention-icon ${task.type==='Maintenance'?'danger':'warning'}`}><Icon name={task.type==='Maintenance'?'repair':'cleaning'} size={30}/></span><div className="attention-copy"><strong>{task.title}</strong><p className="attention-metadata"><span>{w.unitLabel(task.unitId)}</span>{task.priority==='Urgent'&&<Badge tone="danger">Urgent</Badge>}</p></div><div className="attention-actions"><Button onClick={()=>task.workspaceTask?w.edit('tasks',task.id):w.inspect('tasks',task.id)}>{task.workspaceTask?'Assign task':'Open request'}</Button></div></div>)}{attention.length>attentionLimit&&<Pager page={attentionCurrentPage} total={attention.length} pageSize={attentionLimit} onChange={setAttentionPage}/>} {!attention.length&&<Empty title="Everything is on track" description="No urgent or unassigned tasks."/>}<button className="inbox-shortcut" onClick={()=>w.go('inbox')}><Icon name="message" size={29}/><div><strong>NexG Inbox</strong><p>Messages with NexG support</p></div><Icon name="right"/></button></Panel></div>

  <div className="today-section"><div className="mobile-calendar-link"><Button onClick={()=>w.go('calendar')}><Icon name="calendar"/>Open booking calendar<Icon name="right" size={17}/></Button></div><div className="today-heading"><h2>Today's activity</h2><Button variant="ghost" onClick={()=>w.go('reservations')}>View all reservations <Icon name="right" size={17}/></Button></div><div className="activity-toolbar"><div className="tabs activity-tabs" role="tablist" aria-label="Today's activity">{activities.map(item=><button key={item.name} type="button" role="tab" aria-selected={activity===item.name} className={activity===item.name?'active':''} onClick={()=>{setActivity(item.name);setPage(1);}}>{item.name}<span className="activity-count">{item.records.length}</span></button>)}</div>{list.length>cardSize&&<div className="activity-pagination"><Pager page={activityPage} total={list.length} pageSize={cardSize} onChange={setPage}/></div>}</div><div className="arrival-grid">{list.slice((activityPage-1)*cardSize,activityPage*cardSize).map(stay=>{const unit=w.data.units.find(unit=>unit.id===stay.unitId)!;return <Panel className="arrival-card" key={stay.id}><PropertyPhoto index={w.data.properties.findIndex(property=>property.id===unit?.propertyId)}/><div className="arrival-info"><div className="arrival-identity"><Avatar name={stay.guest}/><div className="arrival-guest-copy"><strong>{overviewGuest(stay.guest)}</strong><p>{w.unitLabel(stay.unitId)}</p><small>{stay.guests} guests &middot; {nights(stay)} nights</small></div></div><div className="arrival-status-row"><small><Icon name="calendar" size={15}/>{overviewTime(stay.arrivalTime)}</small><Badge tone={unit?.readiness==='Ready'?'success':'warning'}>{unit?.readiness||'Check readiness'}</Badge></div><button className="text-action arrival-open" onClick={()=>w.inspect('stays',stay.id)}><Icon name="bed" size={17}/>Open stay<Icon name="right" size={16}/></button></div></Panel>;})}{!list.length&&<Empty title={`No ${activity.toLowerCase()} today`} description="Your schedule is clear."/>}</div></div>

  <p className="page-footnote">{w.scope==='all'?w.data.properties.length:1} properties &middot; {w.units.length} units &middot; {w.scope==='all'?'All properties selected':w.propertyLabel(w.scope)}</p>

 </div>;

}

export function PropertyScope(){const w=useWorkspace();return <select className="scope-select" aria-label="Property scope" value={w.scope} onChange={e=>w.setScope(e.target.value)}><option value="all">All properties</option>{w.data.properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}

export function PropertiesPage() {
 const width = useWidth();
 const pageSize = width <= 800 ? 2 : width < 1100 ? 4 : 6;
 const w = useWorkspace();
 const [query, setQuery] = useState('');
 const [status, setStatus] = useState('All statuses');
 const [view, setView] = useState('Cards');
 const [page, setPage] = useState(1);
 const selected = w.page === 'property' ? w.data.properties.find(p => p.id === w.recordId) : undefined;
 const list = w.data.properties.filter(p => (w.scope === 'all' || p.id === w.scope) && `${p.name} ${p.area}`.toLowerCase().includes(query.toLowerCase()) && (status === 'All statuses' || p.status === status));
 const propertyUnits = w.data.units.filter(u => selected ? u.propertyId === selected.id : list.some(p => p.id === u.propertyId));
 const occupied = new Set(w.stays.filter(s => activeStay(s) && s.start <= w.today && s.end > w.today).map(s => s.unitId));
 const currentPage = Math.min(page, Math.max(1, Math.ceil(list.length / pageSize)));
 const visibleProperties = list.slice((currentPage - 1) * pageSize, currentPage * pageSize);

 if (w.section === 'reservations') return <ReservationsPage inProperties propertyId={selected?.id}/>;

 return <div className={`page properties-page ${selected ? '' : 'properties-portfolio'}`}>
  <PageHeader title={selected ? selected.name : 'Properties'} subtitle={selected ? 'Manage units, guest guides and readiness.' : undefined}>
   {!selected&&<Button onClick={()=>w.go('qr-cards')}><Icon name="qr" size={16}/>QR cards</Button>}
   {selected ? <>
    <Button onClick={() => w.go('properties')}><Icon name="left"/>All properties</Button>
    {w.propertyWrites&&<><Button onClick={() => w.edit('properties', selected.id)}>Edit property</Button><Button onClick={()=>w.go('photos',selected.id,'property')}>Manage photos</Button></>}
    {w.propertyWrites&&<Button variant="primary" onClick={() => w.edit('units', undefined, {propertyId: selected.id})}><Icon name="add"/>Add unit</Button>}
   </> : w.propertyWrites&&<Button variant="primary" onClick={() => w.edit('properties')}><Icon name="add"/>Add property</Button>}
  </PageHeader>
  <PropertiesNavigation value="overview" propertyId={selected?.id}/>
  <Panel className="property-summary">
   <span><Icon name="building" size={26}/><strong>{selected ? 1 : list.length}</strong>{selected ? 'property' : 'properties'}</span>
   <span><Icon name="bed" size={26}/><strong>{propertyUnits.length}</strong>units</span>
   <span><Icon name="bed" size={26}/><strong>{propertyUnits.filter(u => occupied.has(u.id)).length}</strong>occupied</span>
   <span><Icon name="bed" size={26}/><strong>{propertyUnits.filter(u => !occupied.has(u.id)).length}</strong>without a recorded stay</span>
  </Panel>
  {selected ? <>
   <div className="toolbar"><span className="muted">Occupancy and operational readiness are tracked separately.</span><Button disabled title="Date blocks need the booking engine">Block dates</Button></div>
   <Panel className="grow"><Table><thead><tr><th>Unit</th><th>Capacity</th><th>Tonight</th><th>Readiness</th><th>Rate</th><th>Guest guide</th><th/></tr></thead><tbody>
    {propertyUnits.map(u => <tr key={u.id}>
     <td><button className="unit-directory-link" onClick={() => w.go('unit', u.id, 'details')}><PropertyPhoto index={w.data.properties.findIndex(p => p.id === u.propertyId)} alt={w.unitLabel(u.id)}/><strong>{u.name}</strong></button></td>
     <td>{u.capacity} guests</td><td><Badge tone={occupied.has(u.id) ? 'info' : 'neutral'}>{occupied.has(u.id) ? 'Occupied' : 'No recorded stay'}</Badge></td>
     <td><Badge tone={u.readiness === 'Ready' ? 'success' : 'warning'}>{u.readiness}</Badge></td><td>{money(u.nightlyMinor)}</td><td>{u.guidePublished ? 'Published' : 'Draft'}</td>
     <td className="row"><Button variant="ghost" onClick={() => w.go('unit', u.id, 'guest-guide')}>Guest guide</Button><Button variant="ghost" onClick={() => w.go('unit', u.id, 'qr-cards')}>QR cards</Button><Button onClick={() => w.go('unit', u.id, 'details')}>Open unit</Button></td>
    </tr>)}
   </tbody></Table>{!propertyUnits.length && <Empty title="Add the first unit" description="Create a unit to start managing stays."/>}</Panel>
  </> : <>
   <div className="toolbar properties-toolbar">
    <label className="search-input"><Icon name="search" size={18}/><input aria-label="Search properties" placeholder="Search properties…" value={query} onChange={e => {setQuery(e.target.value);setPage(1)}}/></label>
    <select aria-label="Property status" value={status} onChange={e => {setStatus(e.target.value);setPage(1)}}><option>All statuses</option><option>Active</option><option>Unlisted</option></select>
    <div className="view-toggle" aria-label="Property view"><Button aria-pressed={view === 'Cards'} variant={view === 'Cards' ? 'primary' : 'secondary'} onClick={() => {setView('Cards');setPage(1)}}>Cards</Button><Button aria-pressed={view === 'List'} variant={view === 'List' ? 'primary' : 'secondary'} onClick={() => {setView('List');setPage(1)}}>List</Button></div>
   </div>
   {view === 'Cards' ? <div className="property-grid">
    {visibleProperties.map(p => {
     const units = w.data.units.filter(u => u.propertyId === p.id);
     const occupiedCount = units.filter(u => occupied.has(u.id)).length;
     const repairs = w.data.tasks.filter(t => units.some(u => u.id === t.unitId) && t.type === 'Maintenance' && t.status !== 'Done').length;
     return <Panel className="property-card property-overview-card" key={p.id}>
      <div className="property-card-media">
       {p.image ? <img src={p.image} alt={p.name}/> : <div className="empty-property-photo"><Icon name="building" size={32}/></div>}
      </div>
      <details className="property-card-menu" onKeyDown={event => {if(event.key === 'Escape'){event.currentTarget.removeAttribute('open');event.currentTarget.querySelector('summary')?.focus()}}}>
       <summary aria-label={`Options for ${p.name}`} title={`Options for ${p.name}`}><span aria-hidden="true">&#8943;</span></summary>
       <div className="property-card-menu-options">
        <Button variant="ghost" onClick={event => {event.currentTarget.closest('details')?.removeAttribute('open');w.edit('properties', p.id)}}>Edit property</Button>
        <Button variant="ghost" onClick={event => {event.currentTarget.closest('details')?.removeAttribute('open');w.edit('units', undefined, {propertyId: p.id})}}>Add unit</Button>
       </div>
      </details>
      <div className="property-card-content">
       <div className="property-card-heading">
        <div className="property-card-identity"><h2>{p.name}</h2><p>{p.area}</p></div>
        <Badge tone={p.status === 'Active' ? (repairs ? 'warning' : 'success') : 'neutral'}>{p.status !== 'Active' ? p.status : repairs ? `${repairs} ${repairs === 1 ? 'repair' : 'repairs'}` : 'Ready'}</Badge>
       </div>
       <div className="property-occupancy-row"><Icon name="bed" size={20}/><span><strong>{units.length}</strong> {units.length === 1 ? 'unit' : 'units'}</span><i aria-hidden="true">·</i><span><strong>{occupiedCount}</strong> occupied</span><i aria-hidden="true">·</i><span><strong>{units.length - occupiedCount}</strong> available</span></div>
       <Button className="property-open-button" variant="ghost" onClick={() => w.go('property', p.id, 'overview')}>Open property<Icon name="right" size={18}/></Button>
      </div>
     </Panel>;
    })}
    {!list.length && <Empty title="No matching properties" description="Try another filter or add a property."/>}
   </div> : <Panel className="grow property-list-panel"><Table><thead><tr><th>Property</th><th>Area</th><th>Units</th><th>Occupied</th><th>No recorded stay</th><th>Status</th><th/></tr></thead><tbody>
    {visibleProperties.map(p => {
     const units = w.data.units.filter(u => u.propertyId === p.id);
     const occupiedCount = units.filter(u => occupied.has(u.id)).length;
     return <tr key={p.id}><td><div className="property-list-identity">{p.image ? <img className="property-list-thumb" src={p.image} alt={p.name}/> : <PropertyPhoto index={w.data.properties.indexOf(p)} className="property-list-thumb" alt={p.name}/>}<strong>{p.name}</strong></div></td><td>{p.area}</td><td><span className="property-list-unit-count"><Icon name="bed" size={19}/>{units.length}</span></td><td>{occupiedCount}</td><td>{units.length - occupiedCount}</td><td><Badge tone={p.status === 'Active' ? 'success' : 'neutral'}>{p.status}</Badge></td><td><Button onClick={() => w.go('property', p.id, 'overview')}>Open property<Icon name="right" size={16}/></Button></td></tr>;
    })}
   </tbody></Table>{!list.length && <Empty title="No matching properties" description="Try another filter or add a property."/>}</Panel>}
   <Pager page={currentPage} total={list.length} pageSize={pageSize} onChange={setPage}/>
  </>}
 </div>;
}
function addDay(date:string,n:number){return new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)}

export function CalendarGrid({compact=false,start:requestedStart,days=7,unitPage=1}:{compact?:boolean;start?:string;days?:number;unitPage?:number}){

 const w=useWorkspace(),start=requestedStart??calendarWeekStart(w.today),dates=Array.from({length:days},(_,index)=>addDay(start,index)),byProperty=w.data.properties.map(property=>w.units.filter(unit=>unit.propertyId===property.id)),roundRobinUnits=Array.from({length:Math.max(0,...byProperty.map(group=>group.length))},(_,index)=>byProperty.flatMap(group=>group[index]?[group[index]]:[])).flat(),units=compact?roundRobinUnits.slice((unitPage-1)*4,unitPage*4):w.units;

 const unassigned=units.filter(unit=>!unit.propertyId);
 const groups=compact?[{id:'all',name:'',units}]:w.data.properties.map(property=>({...property,units:units.filter(unit=>unit.propertyId===property.id)})).filter(property=>property.units.length).concat(unassigned.length?[{id:'unassigned',name:'Unassigned units',description:'',area:'',image:'',status:'Active',units:unassigned}]:[]);

 return <div className={`calendar-scroll ${compact?'mini':''}`} tabIndex={0}><div className="booking-grid" style={{gridTemplateColumns:`${compact?'205px':'var(--calendar-unit-width, 235px)'} repeat(${days},minmax(${days>7?'66':'70'}px,1fr))`}} role="table" aria-label="Unit booking calendar"><div className="grid-head label-col" role="columnheader">Property / Unit</div>{dates.map(date=><div key={date} className={'grid-head '+(date===w.today?'is-today':'')} role="columnheader">{new Date(date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric'})}</div>)}{groups.map(group=><div className="calendar-group" key={group.id}>{!compact&&<div className="property-group-row" style={{gridColumn:`1 / span ${days+1}`}}><PropertyPhoto index={w.data.properties.findIndex(property=>property.id===group.id)}/><strong>{group.name.toUpperCase()}</strong><Badge>{group.units.length} units</Badge></div>}{group.units.map(unit=>{

  const stays=w.stays.filter(stay=>stay.unitId===unit.id&&stay.status!=='Cancelled'&&stay.status!=='Draft'),cleanings=compact?w.data.tasks.filter(task=>task.unitId===unit.id&&task.type==='Cleaning'&&!['Done','Cancelled'].includes(task.status)):[],hasCleaning=cleanings.some(task=>task.due.slice(0,10)>=start&&task.due.slice(0,10)<addDay(start,days));

  return <div className={'calendar-unit-row'+(hasCleaning?' has-cleaning':'')} key={unit.id} role="row"><button className="unit-grid-label label-col" style={{gridColumn:1,gridRow:compact?'1 / span 2':1}} role="cell" onClick={()=>w.go('unit',unit.id)}>{compact&&<PropertyPhoto index={w.data.properties.findIndex(property=>property.id===unit.propertyId)}/>}<span>{compact?w.unitLabel(unit.id):`${group.name} \u00b7 ${unit.name.replace('Unit ','')}`}</span></button>{dates.map((date,index)=><button key={date} style={{gridColumn:index+2,gridRow:compact?'1 / span 2':1}} className={'calendar-cell '+(date===w.today?'is-today':'')} aria-label={`Add reservation ${unit.name} ${date}`} onClick={()=>w.edit('stays',undefined,{unitId:unit.id,start:date,end:addDay(date,2)})}/>)}{stays.map(stay=>{const first=Math.max(0,Math.floor((Date.parse(stay.start)-Date.parse(start))/86400000)),last=Math.min(days,Math.ceil((Date.parse(stay.end)-Date.parse(start))/86400000));if(stay.end<=start||stay.start>dates[days-1]||last<=first)return null;return <button key={stay.id} className={'booking-bar '+(stay.status==='Checked in'?'checked':'')} style={{gridColumn:`${first+2} / ${last+2}`,gridRow:1}} onClick={()=>w.inspect('stays',stay.id)} title={`${stay.guest} \u00b7 ${stay.start} to ${stay.end}`}>{compact?overviewGuest(stay.guest):stay.guest}</button>;})}{compact&&dates.map((date,index)=>{const work=cleanings.filter(task=>task.due.slice(0,10)===date);return work.length?<button key={'cleaning-'+date} className="calendar-cleaning" style={{gridColumn:`${index+2} / span 1`,gridRow:2}} aria-label={`Cleaning for ${w.unitLabel(unit.id)} on ${date}: ${work.map(task=>task.title).join(', ')}`} title={work.map(task=>task.title).join(' \u00b7 ')} onClick={()=>w.inspect('tasks',work[0].id)}><Icon name="cleaning" size={14}/>{work.length>1&&<span>{work.length}</span>}</button>:null;})}</div>;

 })}</div>)}</div></div>;

}

function CalendarAgenda({start}:{start:string}) {
 const w=useWorkspace();
 const dates=Array.from({length:7},(_,index)=>addDay(start,index));
 return <div className="calendar-agenda" aria-label="Weekly reservation agenda">
  {dates.map(date=>{
   const records=w.stays.filter(stay=>!['Cancelled','Draft'].includes(stay.status)&&stay.start<=date&&stay.end>=date).sort((a,b)=>a.start.localeCompare(b.start)||a.guest.localeCompare(b.guest));
   return <section className={'agenda-day'+(date===w.today?' agenda-today':'')} key={date}>
    <div className="agenda-day-heading"><h2><time dateTime={date}>{new Date(date+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short',timeZone:'UTC'})}</time>{date===w.today&&<Badge>Today</Badge>}</h2><Button variant="ghost" aria-label={'Add reservation on '+date} onClick={()=>w.edit('stays',undefined,{start:date,end:addDay(date,2)})}><Icon name="add"/>Add</Button></div>
    {records.length?records.map(stay=><button className="agenda-stay" key={stay.id} onClick={()=>w.inspect('stays',stay.id)}>
     <span className="agenda-stay-copy"><strong>{stay.guest}</strong><span>{w.unitLabel(stay.unitId)}</span><small>{dateText(stay.start)} &ndash; {dateText(stay.end)} &middot; {stay.status}</small></span>
     <span className="agenda-stay-state"><Badge tone={stay.end===date?'neutral':stay.start===date?'success':'info'}>{stay.end===date?'Departure':stay.start===date?'Arrival':'In-house'}</Badge><Icon name="right" size={18}/></span>
    </button>):<p className="agenda-empty">No recorded stays</p>}
   </section>;
  })}
 </div>;
}

export function CalendarPage(){
 const w=useWorkspace(),mobile=useMobile(),[start,setStart]=useState(()=>calendarWeekStart(w.today)),[selectedMode,setMode]=useState<string|null>(null);
 const mode=selectedMode??(mobile?'Agenda':'Week'),days=mode==='Month'?30:7;
 return <div className="page calendar-page"><PageHeader title="Calendar" subtitle="Recorded stays across every unit.">{w.propertyWrites&&<Button onClick={()=>w.go('calendar-connections')}>Connections</Button>}<Button disabled title="Date blocks need the booking engine"><Icon name="calendar"/>Block dates</Button><Button variant="primary" onClick={()=>w.edit('stays')}><Icon name="add"/>Add reservation</Button></PageHeader>
 <Tabs items={['Calendar','Reservations']} value="Calendar" onChange={v=>v==='Reservations'&&w.go('reservations')}/>
 <Panel className="calendar-toolbar"><PropertyScope/><div className="row"><Button aria-label="Previous period" onClick={()=>setStart(addDay(start,-days))}><Icon name="left"/></Button><strong>{dateText(start)} &ndash; {dateText(addDay(start,days-1))} {start.slice(0,4)}</strong><Button aria-label="Next period" onClick={()=>setStart(addDay(start,days))}><Icon name="right"/></Button><Button onClick={()=>setStart(calendarWeekStart(w.today))}>Today</Button></div><Tabs items={['Agenda','Week','Month']} value={mode} onChange={setMode}/></Panel>
 <Panel className={'calendar-main'+(mode==='Agenda'?' agenda-main':'')}>{mode==='Agenda'?<CalendarAgenda start={start}/>:<><p className="calendar-scroll-hint">Swipe across to see more dates. Unit names stay in place.</p><CalendarGrid start={start} days={days}/></>}</Panel>
 {mode!=='Agenda'&&<Panel className="calendar-legend"><span><i className="legend-gold"/>Confirmed</span><span><i className="legend-blue"/>Checked in</span><span><i className="legend-grey"/>Blocked</span><span><Icon name="cleaning" size={18}/>Cleaning is tracked in Operations</span></Panel>}</div>;
}

export function ReservationsPage({inProperties=false,propertyId}:{inProperties?:boolean;propertyId?:string}={}){const w=useWorkspace(),[tab,setTab]=useState('All'),[query,setQuery]=useState(''),[kind,setKind]=useState('All stay types'),[selected,setSelected]=useState('');const stays=propertyId?w.data.stays.filter(stay=>w.data.units.some(unit=>unit.id===stay.unitId&&unit.propertyId===propertyId)):w.stays;const list=stays.filter(s=>`${s.guest} ${s.ref}`.toLowerCase().includes(query.toLowerCase())&&(kind==='All stay types'||s.kind===kind)&&(tab==='All'||tab==='Upcoming'&&s.start>=w.today&&activeStay(s)||tab==='In-house'&&inHouse(s,w.today)||s.status===tab));const record=stays.find(s=>s.id===selected)||list[0];return <div className="page reservations-page"><PageHeader title="Reservations" subtitle="Short stays and long stays, together."><Button onClick={()=>downloadFile('reservations.csv',csv([['Reference','Guest','Unit','Check-in','Check-out','Status','Total KES'],...list.map(s=>[s.ref,s.guest,w.unitLabel(s.unitId),s.start,s.end,s.status,s.totalMinor/100])]))}><Icon name="download"/>Export</Button><Button variant="primary" onClick={()=>w.edit('stays')}><Icon name="add"/>Add reservation</Button></PageHeader>{inProperties&&<PropertiesNavigation value="reservations" propertyId={propertyId}/>}<div className="metrics-grid compact-metrics"><Metric label="Active stays" value={stays.filter(activeStay).length} icon="bed"/><Metric label="Arrivals today" value={stays.filter(s=>s.start===w.today&&activeStay(s)).length} icon="calendar"/><Metric label="Departures today" value={stays.filter(s=>s.end===w.today&&s.status!=='Cancelled').length} icon="calendar"/><Metric label="Balance due" value={money(stays.reduce((n,s)=>n+totals(w.data,s.id).balance,0))}/></div>{!inProperties&&<Tabs items={['Calendar','Reservations']} value="Reservations" onChange={v=>v==='Calendar'&&w.go('calendar')}/>}<Tabs items={['All','Upcoming','In-house','Completed','Cancelled']} value={tab} onChange={setTab}/><div className="toolbar"><label className="search-input"><Icon name="search"/><input placeholder="Search guest or reservation ID…" value={query} onChange={e=>setQuery(e.target.value)}/></label>{!propertyId&&<PropertyScope/>}<select value={kind} onChange={e=>setKind(e.target.value)}><option>All stay types</option><option>Short stay</option><option>Long stay</option></select><Button disabled title="Booking holds need the shared booking engine">Add hold</Button></div><Panel className="reservation-table grow"><Table><thead><tr><th>Guest / reference</th><th>Property & unit</th><th>Dates</th><th>Stay type</th><th>Status</th><th>Balance</th><th/></tr></thead><tbody>{list.map(s=><tr key={s.id} className={record?.id===s.id?'selected-row':''} onClick={()=>setSelected(s.id)}><td><div className="row"><Avatar name={s.guest}/><div><strong>{s.guest}</strong><small>{s.ref}</small></div></div></td><td>{w.unitLabel(s.unitId)}</td><td>{dateText(s.start)} <span className="muted">→</span> {dateText(s.end)}</td><td><Badge>{s.kind}</Badge></td><td><Badge tone={s.status==='Confirmed'?'success':s.status==='Checked in'?'info':s.status==='Cancelled'?'danger':'neutral'}>{s.status}</Badge></td><td><strong>{money(totals(w.data,s.id).balance)}</strong></td><td><Button variant="ghost" onClick={e=>{e.stopPropagation();w.inspect('stays',s.id)}}>View <Icon name="right" size={16}/></Button></td></tr>)}</tbody></Table>{!list.length&&<Empty title="No matching reservations" description="Change the filter or create a reservation."/>}</Panel>{record&&<Panel className="selected-stay"><div className="row spaced"><div className="row"><Avatar name={record.guest} size={44}/><div><h3>{record.guest}</h3><small>{record.ref}</small></div></div><span>{record.guests} guests</span><span>Check-in {dateText(record.start)} · {record.arrivalTime}</span><Badge tone={totals(w.data,record.id).balance?'warning':'success'}>{totals(w.data,record.id).balance?'Balance due':'Payment recorded'}</Badge><Button variant="primary" onClick={()=>w.inspect('stays',record.id)}>Open reservation</Button></div><div className="stay-shortcuts"><Button onClick={()=>w.go('unit',record.unitId,'guest-guide')}><Icon name="qr"/>Guest guide & QR</Button><Button onClick={()=>w.edit('packageJobs',undefined,{unitId:record.unitId,stayId:record.id})}><Icon name="package"/>Packages</Button><Button onClick={()=>w.go('unit',record.unitId,'deliveries')}><Icon name="delivery"/>Deliveries</Button></div></Panel>}</div>}

export function UnitPage(){

 const w=useWorkspace(),unit=w.data.units.find(u=>u.id===w.recordId);

 const [publishing,setPublishing]=useState(false);
 const tab=propertySectionLabel(w.section);

 if(!unit)return <Empty title="Choose a unit" description="Open a property to choose its unit."><Button onClick={()=>w.go('properties')}>Properties</Button></Empty>;

 const property=w.data.properties.find(p=>p.id===unit.propertyId),photoIndex=w.data.properties.findIndex(p=>p.id===unit.propertyId);

 const cards=w.data.qrCards.filter(q=>q.unitId===unit.id);
 const publish=async()=>{
   if(publishing||!window.confirm('Publish this guide for guests with a placed QR card?'))return;
   setPublishing(true);
   try{await w.run({type:'publish',collection:'units',id:unit.id,expectedVersion:unit.guideRevision??0});}
   finally{setPublishing(false);}
 };

 return <div className="page unit-page">

  <div className="unit-header"><PropertyPhoto src={unit.image} index={photoIndex} alt={property?.name||'Unit'}/><div className="unit-header-copy"><h1>{w.unitLabel(unit.id)}</h1><p>{unit.bedrooms} bedroom · {unit.capacity} guests · {property?.area}</p></div><Badge tone={unit.readiness==='Ready'?'success':'warning'}>{unit.readiness==='Cleaning'?'Cleaning pending':unit.readiness}</Badge><div className="page-actions">{['Unit details','Access'].includes(tab)&&<Button onClick={()=>w.go('photos',unit.id,'unit')}>Manage photos</Button>}<Button onClick={()=>w.go('guide-preview',unit.id)}><Icon name="book" size={18}/>Preview guest guide</Button>{tab==='Guest guide'&&<Button variant="primary" disabled={publishing||!w.data.articles.some(article=>article.unitId===unit.id)} onClick={()=>void publish()}>Publish guide</Button>}</div></div>

  <PropertiesNavigation value={propertySectionSlug(tab)} propertyId={unit.propertyId} unitId={unit.id}/>

  {tab==='Guest guide'?<UnitGuideEditor unit={unit}/>
  :['Availability','Tasks & requests','Packages','Deliveries','Finances','Messages'].includes(tab)?<UnitMoreSection unitId={unit.id} section={tab}/>
  :tab==='History'?<UnitGuideHistory unit={unit}/>
  :tab==='QR cards'?<><div className="toolbar"><p>Create a card for each useful spot in this unit.</p><Button variant="primary" onClick={()=>w.edit('qrCards',undefined,{unitId:unit.id})}><Icon name="add"/>Generate QR card</Button></div><Panel className="grow"><Table><thead><tr><th>Location</th><th>Status</th><th>Scans</th><th>Orders</th><th/></tr></thead><tbody>{cards.map(q=><tr key={q.id}><td>{q.spot}</td><td><Badge>{q.status}</Badge></td><td>{q.scans}</td><td>{q.orders}</td><td><Button onClick={()=>w.inspect('qrCards',q.id)}>Open / download</Button></td></tr>)}</tbody></Table>{!cards.length&&<Empty title="No QR cards yet" description="Save the guide, then create a card."/>}</Panel></>

  :tab==='Reservations'?<Panel className="grow"><div className="panel-heading"><h2>This unit’s stays</h2><Button onClick={()=>w.edit('stays',undefined,{unitId:unit.id})}>Add reservation</Button></div><Table><thead><tr><th>Guest</th><th>Dates</th><th>Status</th><th/></tr></thead><tbody>{w.data.stays.filter(s=>s.unitId===unit.id).map(s=><tr key={s.id}><td>{s.guest}</td><td>{dateText(s.start)}–{dateText(s.end)}</td><td>{s.status}</td><td><Button onClick={()=>w.inspect('stays',s.id)}>View</Button></td></tr>)}</tbody></Table></Panel>

  :<Panel className="unit-details"><PropertyPhoto index={photoIndex}/><div><h2>{tab==='Access'?'Access & delivery':'Unit details'}</h2><dl className="detail-grid">{(tab==='Access'?[['Guest access',unit.access],['Delivery rule',unit.deliveryRule],['Contact',unit.contact],['Delivery hours',unit.hours]]:[['Capacity',unit.capacity+' guests'],['Bedrooms',unit.bedrooms],['Bathrooms',unit.bathrooms],['Nightly rate',money(unit.nightlyMinor)],['Readiness',unit.readiness],['Status',unit.status]]).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Not set'}</dd></div>)}</dl><div className="row"><Button variant="primary" onClick={()=>w.edit('units',unit.id)}>Edit unit</Button></div></div></Panel>}

 </div>;

}

function UnitMoreSection({unitId,section}:{unitId:string;section:string}){
 const w=useWorkspace(),[financeView,setFinanceView]=useState('Payments'),unit=w.data.units.find(item=>item.id===unitId);
 if(!unit)return <Empty title="Choose a unit"/>;
 const stays=w.data.stays.filter(stay=>stay.unitId===unitId),stayIds=new Set(stays.map(stay=>stay.id)),eligibleStay=stays.find(stay=>!['Draft','Hold','Cancelled'].includes(stay.status)),linkedStay=eligibleStay||stays[0];
 const stayLabel=(id:string|undefined)=>stays.find(stay=>stay.id===id)?.guest||'Unit record';
 const tasks=w.data.tasks.filter(record=>record.unitId===unitId),jobs=w.data.packageJobs.filter(record=>record.unitId===unitId),deliveries=w.data.deliveries.filter(record=>record.unitId===unitId);
 const payments=w.data.payments.filter(record=>stayIds.has(record.stayId)),expenses=w.data.expenses.filter(record=>record.unitId===unitId);
 const newTask=(workspaceTask:boolean)=>w.edit('tasks',undefined,{unitId,workspaceTask,type:workspaceTask?'Maintenance':'other',status:'To do',priority:'Normal',assigneeId:w.actor.id,due:`${w.today}T14:00`});
 const packageDefault=w.data.packages[0],fulfilment=new Date(Date.now()+(Math.max(4,packageDefault?.leadHours||0)+1)*3600000),fulfilmentLocal=new Date(fulfilment.getTime()-fulfilment.getTimezoneOffset()*60000).toISOString().slice(0,16);
 const moneyValue=(amount:number)=>money(amount,w.data.settings.currency);
 if(section==='Availability')return <Panel className="grow unit-section-panel">
  <div className="panel-heading"><h2>Availability</h2></div>
  <Empty title="Recorded stays" description="Live availability and date blocks come from the shared booking engine once it is connected.">
   <Button onClick={()=>w.go('unit',unitId,'reservations')}>View recorded reservations</Button>
  </Empty>
 </Panel>;
 if(section==='Tasks & requests')return <Panel className="grow unit-section-panel"><div className="panel-heading"><div><h2>Tasks &amp; requests</h2><small>Cleaning, inspections, repairs and guest requests.</small></div><div className="row"><Button onClick={()=>newTask(false)}>Add request</Button><Button variant="primary" onClick={()=>newTask(true)}><Icon name="add" size={16}/>Create task</Button></div></div><Table><thead><tr><th>Task</th><th>Type</th><th>Assigned to</th><th>Due</th><th>Priority</th><th>Status</th><th/></tr></thead><tbody>{tasks.map(record=><tr key={record.id}><td><strong>{record.title}</strong></td><td>{record.type}</td><td>{w.data.team.find(member=>member.id===record.assigneeId)?.name||'Unassigned'}</td><td>{dateText(record.due)}</td><td><Badge tone={record.priority==='Urgent'?'danger':record.priority==='High'?'warning':'neutral'}>{record.priority}</Badge></td><td><Badge tone={record.status==='Done'?'success':'neutral'}>{record.status}</Badge></td><td className="row"><Button variant="ghost" onClick={()=>w.inspect('tasks',record.id)}>View</Button>{w.canEdit('tasks',record.id)&&<Button onClick={()=>w.edit('tasks',record.id)}>Edit</Button>}</td></tr>)}</tbody></Table>{!tasks.length&&<Empty title="No work recorded" description="Create a task with an assignee, due date and checklist."/>}</Panel>;
 if(section==='Packages')return <Panel className="grow unit-section-panel"><div className="panel-heading"><div><h2>Packages</h2><small>Scheduled welcome packages and placement evidence.</small></div><Button variant="primary" onClick={()=>w.edit('packageJobs',undefined,{unitId,stayId:linkedStay?.id||'',packageId:packageDefault?.id||'',due:fulfilmentLocal,status:'Scheduled'})}><Icon name="add" size={16}/>Schedule package</Button></div><Table><thead><tr><th>Package</th><th>Reservation</th><th>Place before</th><th>Price</th><th>Status</th><th>Evidence</th><th/></tr></thead><tbody>{jobs.map(record=>{const item=w.data.packages.find(item=>item.id===record.packageId);return <tr key={record.id}><td><strong>{item?.title||String(record.title||'Package')}</strong><small>{Number(record.leadHours??item?.leadHours??0)}h lead time</small></td><td>{stayLabel(record.stayId)}</td><td>{dateText(record.due)}</td><td>{typeof record.amountMinor==='number'?moneyValue(record.amountMinor):'—'}</td><td><Badge tone={record.status==='Placed'?'success':record.status==='Cancelled'?'neutral':'warning'}>{record.status}</Badge></td><td>{record.hasPhoto?'On file':'Pending'}</td><td className="row"><Button variant="ghost" onClick={()=>w.inspect('packageJobs',record.id)}>View</Button></td></tr>;})}</tbody></Table>{!jobs.length&&<Empty title="No packages scheduled" description="Choose a package, reservation and placement time."/>}</Panel>;
 if(section==='Deliveries')return <Panel className="grow unit-section-panel"><div className="panel-heading"><div><h2>Deliveries</h2><small>Handoff instructions and evidence stay with each delivery.</small></div><Button onClick={()=>w.edit('tasks',undefined,{unitId,type:'order',kind:'issue',priority:'Normal',ownerKind:'nexg_rider_ops'})}>Report delivery issue</Button></div><Table><thead><tr><th>Delivery</th><th>Reference</th><th>Reservation</th><th>Handoff</th><th>Stage</th><th>Evidence</th><th/></tr></thead><tbody>{deliveries.map(record=><tr key={record.id}><td><strong>{record.title}</strong></td><td>{record.reference}</td><td>{stayLabel(record.stayId)}</td><td>{record.rule}</td><td><Badge tone={record.stage==='Delivered'?'success':record.stage==='Problem'?'danger':'neutral'}>{record.stage}</Badge></td><td>{record.hasProof?'On file':'Pending'}</td><td className="row"><Button variant="ghost" onClick={()=>w.inspect('deliveries',record.id)}>View</Button></td></tr>)}</tbody></Table>{!deliveries.length&&<Empty title="No deliveries recorded" description="Guest orders for this unit appear here when NexG dispatches them."/>}</Panel>;
 if(section==='Messages')return <Panel className="grow unit-section-panel">
  <div className="panel-heading"><div><h2>Messages</h2><small>Ask NexG Concierge about a guest, order or delivery for this unit.</small></div>
   <Button variant="primary" onClick={()=>w.go('inbox','new',unit.id)}><Icon name="message" size={16}/>Contact Concierge</Button>
  </div>
  <Empty title="NexG support conversations" description="Include a booking or order reference so Concierge can help with the guest inquiry.">
   <Button onClick={()=>w.go('inbox')}>Open Inbox</Button>
  </Empty>
 </Panel>;
 const financeViews=['Payments','Expenses','Stay balances','Folio charges','NexG bills'];
 const paymentAction=()=>eligibleStay?w.edit('payments',undefined,{unitId,stayId:eligibleStay.id,type:'Receipt',status:'Recorded',date:w.today}):w.edit('stays',undefined,{unitId});
 return <Panel className="grow unit-section-panel unit-finance-panel">
 <div className="panel-heading"><div><h2>Finances</h2><small>Accommodation, deposits, expenses and NexG bills stay separate.</small></div>
  {financeView==='Payments'?<Button variant="primary" onClick={paymentAction}>{eligibleStay?'Record payment':'Add reservation'}</Button>
  :financeView==='Expenses'?<Button variant="primary" onClick={()=>w.edit('expenses',undefined,{unitId,date:w.today,status:'Recorded'})}>Add expense</Button>
  :financeView==='Stay balances'?<Button variant="primary" onClick={()=>w.edit('stays',undefined,{unitId})}>Add reservation</Button>:null}
 </div>
 <Tabs items={financeViews} value={financeView} onChange={setFinanceView}/>
 {financeView==='Payments'?<><Table><thead><tr><th>Reservation</th><th>Category</th><th>Amount</th><th>Date</th><th>Reference</th><th>Status</th><th/></tr></thead><tbody>{payments.map(record=><tr key={record.id}><td>{stayLabel(record.stayId)}</td><td>{record.type}</td><td><strong>{moneyValue(record.amountMinor)}</strong></td><td>{dateText(record.date)}</td><td>{record.reference}</td><td><Badge tone={record.status==='Recorded'?'success':record.status==='Failed'?'danger':'warning'}>{record.status}</Badge></td><td className="row"><Button variant="ghost" onClick={()=>w.inspect('payments',record.id)}>View</Button></td></tr>)}</tbody></Table>{!payments.length&&<Empty title="No payment records" description="Record accommodation receipts, refunds and deposits against a confirmed stay."/>}</>
 :financeView==='Expenses'?<><Table><thead><tr><th>Expense</th><th>Category</th><th>Amount</th><th>Date</th><th>Status</th><th/></tr></thead><tbody>{expenses.map(record=><tr key={record.id}><td><strong>{record.description}</strong></td><td>{record.category}</td><td>{moneyValue(record.amountMinor)}</td><td>{dateText(record.date)}</td><td><Badge>{record.status}</Badge></td><td className="row"><Button variant="ghost" onClick={()=>w.inspect('expenses',record.id)}>View</Button></td></tr>)}</tbody></Table>{!expenses.length&&<Empty title="No expenses recorded" description="Record a cost for this unit."/>}</>
 :financeView==='Stay balances'?<><Table><thead><tr><th>Reservation</th><th>Dates</th><th>Accommodation</th><th>Receipts</th><th>Refundable deposit</th><th>Balance</th><th/></tr></thead><tbody>{stays.map(stay=>{const summary=totals(w.data,stay.id);return <tr key={stay.id}><td><strong>{stay.guest}</strong><small>{stay.ref}</small></td><td>{dateText(stay.start)} &ndash; {dateText(stay.end)}</td><td>{moneyValue(summary.accommodation)}</td><td>{moneyValue(summary.receipts)}</td><td>{moneyValue(summary.deposits)}</td><td><strong>{moneyValue(summary.balance)}</strong></td><td><Button onClick={()=>w.inspect('stays',stay.id)}>Open stay</Button></td></tr>;})}</tbody></Table>{!stays.length&&<Empty title="No stays yet" description="Create a reservation before recording its money."/>}</>
 :financeView==='Folio charges'?<Empty title="NexG room folios" description={w.data.settings.invoiceAccess
   ? 'The hotel front desk posts charges and tracks settlement. Open the folio history for your account.'
   : 'Account-wide access is required to open the hotel folio history.'}>
   {Boolean(w.data.settings.invoiceAccess)&&<Button onClick={()=>w.go('financial-history','folios')}>Open room folios</Button>}
  </Empty>
 :<Empty title="NexG service bills" description={w.data.settings.invoiceAccess
   ? 'Package placement and service bills appear in your account’s NexG invoice ledger.'
   : 'Account-wide access is required to open NexG invoices.'}>
   {Boolean(w.data.settings.invoiceAccess)&&<Button onClick={()=>w.go('finances','invoices')}>Open NexG invoices</Button>}
  </Empty>}
 </Panel>;
}
