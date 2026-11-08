import 'server-only';

import { dateKey, dateText, money, nextDate } from '../../../../hosts-workspace/src/model';
import type { HostHistory } from '../../../../hosts-workspace/src/history';
import { HostWorkspaceError, type HostWorkspaceAccess } from './access';
import { allRows } from './read';

const label = (value: string | null) =>
  value ? value.charAt(0).toUpperCase()+value.slice(1).replaceAll('_',' ') : '—';
const value = (amount: number | null | undefined) => amount == null ? '—' : money(amount);
const count = (amount: number | null | undefined) => amount == null ? '—' : amount.toLocaleString('en-KE');
function checked<T>(result: {data:T;error:unknown}) {
  if (result.error) throw new HostWorkspaceError(503,'These host records could not be loaded.');
  return result.data;
}

export async function financeHistory(access: HostWorkspaceAccess): Promise<HostHistory> {
  const {db,hostId,userId,unitScope} = access;
  if (unitScope) throw new HostWorkspaceError(403,'An account-wide host can open statements and folios.');
  const [earningsResult, lines, memberships] = await Promise.all([
    db.from('host_earnings_v').select('*').eq('host_id',hostId).maybeSingle(),
    allRows((from,to) => db.from('host_statement_v').select('id,effective_at,line_kind,memo,amount_cents')
      .eq('host_id',hostId).order('effective_at',{ascending:false}).order('id',{ascending:false}).range(from,to)),
    allRows((from,to) => db.from('hotel_user').select('hotel_id').eq('user_id',userId).order('hotel_id').range(from,to)),
  ]);
  const hotels = memberships.map(row=>row.hotel_id);
  const folios = hotels.length ? await allRows((from,to) => db.from('host_folio_v')
    .select('id,order_reference,room_no,amount,commission_amount,status,sync,folio_ref,pms_posted_at,created_at,desk_note')
    .in('hotel_id',hotels).order('created_at',{ascending:false}).order('id').range(from,to)) : [];
  const earnings = checked(earningsResult);
  return {
    metrics:[
      {label:'Invoices due',value:value(earnings?.outstanding_cents),note:'NexG invoices'},
      {label:'Invoices paid',value:value(earnings?.paid_cents),note:count(earnings?.invoices_count)+' invoices'},
      {label:'Referral credits',value:value(earnings?.rewards_credited_kes==null?null:earnings.rewards_credited_kes*100),note:'Credits applied by NexG'},
      {label:'Guest order value',value:value(earnings?.guest_order_value_cents),note:count(earnings?.guest_order_count)+' guest orders'},
    ],
    sections:[
      {label:'Ledger statement',headers:['Date','Kind','Description','Amount'],
        rows:lines.flatMap(row=>row.id==null?[]:[{id:String(row.id),cells:[dateText(row.effective_at??''),label(row.line_kind),row.memo??'—',value(row.amount_cents)]}]),
        empty:'No ledger entries for this account.',note:'Statement entries use the same ledger as NexG Finance.'},
      {label:'Room folios',headers:['Order','Room','Amount','Commission','Status','PMS sync','Folio / desk note'],
        rows:folios.flatMap(row=>row.id?[{id:row.id,cells:[row.order_reference??'—',row.room_no??'—',
          value(row.amount),value(row.commission_amount),label(row.status),label(row.sync),
          [row.folio_ref,row.pms_posted_at?dateText(row.pms_posted_at):null,row.desk_note].filter(Boolean).join(' · ')||'—']}]:[]),
        empty:hotels.length?'No charge-to-room entries for your hotel account.':'Room folios require an assigned hotel account.',
        note:'The front desk and PMS own posting and settlement status.'},
    ],
  };
}

export async function analyticsHistory(access: HostWorkspaceAccess): Promise<HostHistory> {
  const {db,hostId,unitScope} = access;
  const start = nextDate(dateKey(),-29);
  const [daily,hourly,units] = await Promise.all([
    unitScope ? [] : allRows((from,to) => db.from('host_analytics_daily_v').select('day,scans,orders,order_value_cents')
      .eq('host_id',hostId).gte('day',start).order('day',{ascending:false}).range(from,to)),
    unitScope ? [] : allRows((from,to) => db.from('host_analytics_hour_v').select('dow,hour,scans,orders')
      .eq('host_id',hostId).order('dow').order('hour').range(from,to)),
    unitScope?.length===0 ? [] : allRows((from,to) => {
      const query=db.from('host_analytics_unit_v').select('unit_id,unit_name,property_name,scans,orders,order_value_cents,conversion_pct').eq('host_id',hostId);
      if (unitScope) query.in('unit_id',unitScope);
      return query.order('scans',{ascending:false}).order('unit_id').range(from,to);
    }),
  ]);
  const unitSection = {
    label:'By unit',headers:['Property / unit','Scans','Orders','Order value','Conversion'],
    rows:units.flatMap(row=>row.unit_id?[{id:row.unit_id,cells:[[row.property_name,row.unit_name].filter(Boolean).join(' · '),
      count(row.scans),count(row.orders),value(row.order_value_cents),row.conversion_pct==null?'—':row.conversion_pct+'%']}]:[]),
    empty:'No QR activity for your units.',
  };
  if (unitScope) return {metrics:[],sections:[unitSection]};
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const scans = daily.reduce((total,row)=>total+(row.scans??0),0);
  const orders = daily.reduce((total,row)=>total+(row.orders??0),0);
  return {
    metrics:[
      {label:'QR scans',value:count(scans),note:'Last 30 days'},
      {label:'Attributed orders',value:count(orders),note:'Last 30 days'},
      {label:'Order value',value:money(daily.reduce((total,row)=>total+(row.order_value_cents??0),0)),note:'Guest merchant orders'},
    ],
    sections:[
      {label:'Daily trend',headers:['Day','Scans','Orders','Order value'],
        rows:daily.flatMap(row=>row.day?[{id:row.day,cells:[dateText(row.day),count(row.scans),count(row.orders),value(row.order_value_cents)]}]:[]),
        empty:'No QR activity in the last 30 days.'},
      {label:'By hour',headers:['Weekday','Hour','Scans','Orders'],
        rows:hourly.flatMap(row=>row.hour==null||row.dow==null?[]:[{id:row.dow+':'+row.hour,
          cells:[days[row.dow-1]??'—',String(row.hour).padStart(2,'0')+':00',count(row.scans),count(row.orders)]}]),
        empty:'No hourly activity recorded.'},
      unitSection,
    ],
  };
}

const ticketDate = (value: string) => value
  ? new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
  : '—';

export async function supportHistory({ db }: HostWorkspaceAccess): Promise<HostHistory> {
  const tickets = await allRows((from, to) => db.from('host_ticket_v')
    .select('id,reference,topic,status,created_at,first_reply_at,resolved_at,body')
    .order('created_at', { ascending: false }).order('id').range(from, to));
  const resolved = tickets.filter(ticket => ticket.resolved_at).length;
  return {
    metrics: [
      { label: 'Tickets recorded', value: count(tickets.length), note: 'Opened by your account' },
      { label: 'Tickets resolved', value: count(resolved), note: 'Closed by NexG' },
    ],
    sections: [{
      label: 'Your support tickets',
      headers: ['Reference', 'Topic', 'Status', 'Opened', 'First reply', 'Resolved', 'Message'],
      rows: tickets.flatMap(ticket => ticket.id ? [{
        id: ticket.id,
        cells: [ticket.reference ?? '—', label(ticket.topic), label(ticket.status),
          ticketDate(ticket.created_at ?? ''), ticketDate(ticket.first_reply_at ?? ''),
          ticketDate(ticket.resolved_at ?? ''), ticket.body ?? '—'],
      }] : []),
      empty: 'No support tickets were opened by your account.',
      note: 'Open Inbox to follow up with NexG support.',
    }],
  };
}

export async function privacyHistory({ db, hostId, unitScope }: HostWorkspaceAccess): Promise<HostHistory> {
  if (unitScope) throw new HostWorkspaceError(403, 'An account-wide host can view shared privacy request status.');
  const requests = await allRows((from, to) => db.rpc('rpc_host_workspace_shared_data_requests', { p_host_id: hostId }).range(from, to));
  return {
    metrics: [],
    sections: [{
      label: 'Shared requests',
      headers: ['Request', 'Type', 'Status', 'Identity verified', 'Received', 'Due', 'Fulfilled'],
      rows: requests.map(request => ({
        id: request.id,
        cells: [request.id, label(request.kind), label(request.status), request.verified ? 'Yes' : 'Pending',
          dateText(request.received_at), dateText(request.due_at ?? ''), dateText(request.fulfilled_at ?? '')],
      })),
      empty: 'NexG has yet to share any verified request status with this workspace.',
      note: 'NexG shares verified requests linked to guest activity with your workspace.',
    }],
  };
}
