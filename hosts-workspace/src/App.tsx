import {useEffect,useState} from 'react';

import {errorMessage,workspaceRequest,WorkspaceConnectionError} from './client';
import type {WorkspaceSnapshot} from './model';
import {RecordDialog} from './RecordDialog';
import {personalAppearance,workspaceReminders} from './settings';
import {Avatar,Button,Empty,Icon,Panel} from './ui';
import {hostSignIn,WorkspaceProvider,useWorkspace} from './workspace';
import {CalendarConnectionsPage} from './pages/CalendarConnections';
import {GuestGuidePreview} from './pages/GuestGuide';
import {HistoryPage} from './pages/History';
import {OverviewPage,PropertiesPage,CalendarPage,ReservationsPage,UnitPage} from './pages/Homes';
import {SupportInboxPage} from './pages/Inbox';
import {FinancesPage,ReportsPage,SettingsPage} from './pages/Management';
import {HelpPage,OperationsPage} from './pages/Operations';
import {PhotosPage} from './pages/Photos';
import {QrCardsPage} from './pages/QrCards';
import {SetupPage} from './pages/Setup';

const nav = [
  ['overview','Overview','home'], ['properties','Properties','building'], ['calendar','Calendar','calendar'],
  ['inbox','Inbox','message'], ['operations','Operations','task'], ['finances','Finances','money'],
];
const groups: Record<string,string> = {
  'support-tickets':'inbox', 'privacy-requests':'settings', setup:'overview', property:'properties', unit:'properties', photos:'properties', 'guide-preview':'properties', 'qr-cards':'properties',
  reservations:'calendar', 'calendar-connections':'calendar', 'financial-history':'finances', 'qr-analytics':'reports',
};

export default function App() {
  const [snapshot,setSnapshot]=useState<WorkspaceSnapshot|null>(null);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const request=new AbortController();
    workspaceRequest<WorkspaceSnapshot>('',{signal:request.signal})
      .then(setSnapshot)
      .catch(cause=>{
        if(request.signal.aborted)return;
        if(cause instanceof WorkspaceConnectionError&&cause.status===401)hostSignIn();
        else setError(errorMessage(cause,'Your workspace could not be reached.'));
      });
    return ()=>request.abort();
  },[attempt]);
  if(snapshot)return <WorkspaceProvider initial={snapshot}><Shell/></WorkspaceProvider>;
  return <div className="connected-entry">
    <Empty title={error?'Your workspace could not be opened':'Opening your workspace'} description={error||'Loading your host records…'}>
      {error&&<Button onClick={()=>{setError('');setAttempt(attempt+1);}}>Try again</Button>}
    </Empty>
  </div>;
}

function WorkspacePage() {
  const {page,recordId}=useWorkspace();
  switch(page){
    case 'setup':return <SetupPage/>;
    case 'properties':
    case 'property':return <PropertiesPage/>;
    case 'unit':return <UnitPage key={recordId}/>;
    case 'guide-preview':return <GuestGuidePreview key={recordId}/>;
    case 'photos':return <PhotosPage/>;
    case 'qr-cards':return <QrCardsPage/>;
    case 'calendar':return <CalendarPage/>;
    case 'calendar-connections':return <CalendarConnectionsPage/>;
    case 'reservations':return <ReservationsPage/>;
    case 'inbox':return <SupportInboxPage routeId={recordId}/>;
    case 'support-tickets':return <HistoryPage key="support" kind="support"/>;
    case 'privacy-requests':return <HistoryPage key="privacy" kind="privacy"/>;
    case 'operations':return <OperationsPage key={recordId}/>;
    case 'finances':return <FinancesPage/>;
    case 'financial-history':return <HistoryPage key={'finance'+recordId} kind="finance"/>;
    case 'reports':return <ReportsPage/>;
    case 'qr-analytics':return <HistoryPage key="analytics" kind="analytics"/>;
    case 'settings':return <SettingsPage key={recordId}/>;
    case 'help':return <HelpPage/>;
    default:return <OverviewPage/>;
  }
}

function Shell() {
  const w=useWorkspace();
  const [menu,setMenu]=useState(false);
  const active=groups[w.page]??w.page;
  const {theme,accent,sidebar,density,font_size}=personalAppearance(w.data.settings);
  useEffect(()=>setMenu(false),[w.page,w.recordId,w.section]);
  useEffect(()=>{
    const root=document.documentElement;
    root.dataset.hostTheme=theme;
    root.dataset.hostSidebar=sidebar;
    root.dataset.hostDensity=density;
    root.dataset.hostFont=font_size;
    if(theme==='custom'&&accent)root.style.setProperty('--host-personal-accent',accent);
    else root.style.removeProperty('--host-personal-accent');
    return ()=>{
      delete root.dataset.hostTheme;
      delete root.dataset.hostSidebar;
      delete root.dataset.hostDensity;
      delete root.dataset.hostFont;
      root.style.removeProperty('--host-personal-accent');
    };
  },[theme,accent,sidebar,density,font_size]);
  return <div className="app-shell">
    <a className="skip-link" href="#page-content">Skip to workspace</a>
    {menu&&<button className="mobile-backdrop" aria-label="Close navigation" onClick={()=>setMenu(false)}/>}
    <aside className={'sidebar '+(menu?'mobile-open':'')}>
      <button className="brand" onClick={()=>w.go('overview')} aria-label="NexG Stays overview"><strong>NEXG</strong><span>STAYS</span></button>
      <select className="portfolio-switch" aria-label="Filter workspace by property" value={w.scope} onChange={event=>w.setScope(event.target.value)}>
        <option value="all">{w.actor.name.split(' ')[0]}’s portfolio</option>
        {w.data.properties.filter(property=>property.status!=='Archived').map(property=><option key={property.id} value={property.id}>{property.name}</option>)}
      </select>
      <nav aria-label="Main navigation">{nav.map(([key,label,icon])=><button key={key} className={active===key?'active':''}
        aria-current={active===key?'page':undefined} onClick={()=>w.go(key)}>
        <Icon name={icon} size={23}/><span>{label}</span>
      </button>)}</nav>
      <div className="sidebar-bottom">
        <nav aria-label="Workspace settings">
          <button className={active==='reports'?'active':''} onClick={()=>w.go('reports')}><Icon name="chart" size={23}/>Reports</button>
          <button className={active==='settings'?'active':''} onClick={()=>w.go('settings')}><Icon name="settings" size={23}/>Settings</button>
        </nav>
        <button className="owner-profile" onClick={()=>w.go('settings')}><Avatar name={w.actor.name} size={40}/>
          <div><strong>{w.actor.name}</strong><small>{w.actor.role}</small></div><span>⌄</span>
        </button>
        <Button variant="ghost" onClick={()=>void w.signOut()}>Sign out</Button>
      </div>
    </aside>
    <div className="main-shell">
      <WorkspaceHeader toggleMenu={()=>setMenu(value=>!value)}/>
      <main id="page-content" className="page-content" tabIndex={-1}><WorkspacePage/></main>
    </div>
    <RecordDialog/>
  </div>;
}

function WorkspaceHeader({toggleMenu}:{toggleMenu:()=>void}) {
  const w=useWorkspace();
  const [query,setQuery]=useState('');
  const [alerts,setAlerts]=useState(false);
  useEffect(()=>{setQuery('');setAlerts(false);},[w.page,w.recordId,w.section]);
  const search=query.trim().toLowerCase();
  const results=search?[
    ...w.units.filter(unit=>w.unitLabel(unit.id).toLowerCase().includes(search))
      .map(unit=>({label:w.unitLabel(unit.id),type:'Unit',open:()=>w.go('unit',unit.id)})),
    ...w.stays.filter(stay=>(stay.guest+' '+stay.ref).toLowerCase().includes(search))
      .map(stay=>({label:stay.guest+' · '+stay.ref,type:'Reservation',open:()=>w.inspect('stays',stay.id)})),
    ...w.data.tasks.filter(task=>w.units.some(unit=>unit.id===task.unitId)&&task.title.toLowerCase().includes(search))
      .map(task=>({label:task.title,type:'Task',open:()=>w.inspect('tasks',task.id)})),
  ].slice(0,5):[];
  const reminders=workspaceReminders(w.data,w.units,w.stays,w.today);
  return <header className="topbar">
    <Button className="mobile-menu" aria-label="Open navigation" onClick={toggleMenu}><Icon name="home"/></Button>
    <WorkspaceBreadcrumb/>
    <span className="preview-pill">Connected workspace</span>
    <div className="global-search"><Icon name="search" size={20}/>
      <input aria-label="Search properties, guests and tasks" placeholder="Search properties, guests…" value={query} onChange={event=>setQuery(event.target.value)}/>
      {query&&<div className="search-results">{results.length?results.map((result,index)=>
        <button key={index} onClick={()=>{result.open();setQuery('');}}><strong>{result.label}</strong><small>{result.type}</small></button>
      ):<p>No matching records in this property view.</p>}</div>}
    </div>
    <Button className="header-help" onClick={()=>w.go('help')}><Icon name="help" size={20}/>Help</Button>
    <div className="notification-wrap">
      <Button className="notification-button" aria-label="Notifications" onClick={()=>setAlerts(!alerts)}><Icon name="notification" size={25}/>{(reminders.requests.length>0||reminders.arrivals.length>0)&&<i/>}</Button>
      {alerts&&<Panel className="notification-menu">
        <h3>Needs attention</h3>{reminders.daily&&<p>{reminders.daily}</p>}
        {reminders.arrivals.slice(0,3).map(stay=><button key={stay.id} onClick={()=>{w.inspect('stays',stay.id);setAlerts(false);}}>
          <strong>{stay.guest} arrives today</strong><small>{w.unitLabel(stay.unitId)}</small>
        </button>)}
        {reminders.requests.slice(0,3).map(task=><button key={task.id} onClick={()=>{w.inspect('tasks',task.id);setAlerts(false);}}>
          <strong>{task.title}</strong><small>{w.unitLabel(task.unitId)}</small>
        </button>)}
        <Button onClick={()=>w.go('operations')}>Open operations</Button>
      </Panel>}
    </div>
    <button className="header-avatar" aria-label="Workspace settings" onClick={()=>w.go('settings')}><Avatar name={w.actor.name}/><span>⌄</span></button>
  </header>;
}

const titles: Record<string,string> = {
  'support-tickets':'Inbox / Support tickets', 'privacy-requests':'Settings / Privacy requests', setup:'Setup & verification', photos:'Photos', 'guide-preview':'Guest guide preview', 'qr-cards':'QR cards', reservations:'Calendar / Reservations',
  'calendar-connections':'Calendar / Connections', 'financial-history':'Finances / Statement',
  'qr-analytics':'Reports / QR analytics', help:'Help center', settings:'Settings', reports:'Reports',
};

function WorkspaceBreadcrumb() {
  const w=useWorkspace();
  const unit=w.page==='unit'?w.data.units.find(item=>item.id===w.recordId):undefined;
  const property=w.data.properties.find(item=>item.id===(w.page==='property'?w.recordId:unit?.propertyId));
  const inProperties=['properties','property','unit'].includes(w.page);
  const title=titles[w.page]??nav.find(item=>item[0]===w.page)?.[1]??'Overview';
  return <nav className="breadcrumb" aria-label="Breadcrumb">
    <a href="#overview">Workspace</a><span aria-hidden="true">/</span>
    {inProperties?<><a href="#properties">Properties</a>{property&&<>
      <span aria-hidden="true">/</span>
      {unit?<a href={'#property/'+encodeURIComponent(property.id)+'/overview'}>{property.name}</a>:<strong aria-current="page">{property.name}</strong>}
    </>}{unit&&<><span aria-hidden="true">/</span><strong aria-current="page">{unit.name}</strong></>}</>:<strong aria-current="page">{title}</strong>}
  </nav>;
}
