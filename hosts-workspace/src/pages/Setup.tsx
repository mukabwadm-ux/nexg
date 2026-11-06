import { useState } from 'react';

import { dateText } from '../model';
import { Badge, Button, Empty, Icon, PageHeader, Pager, Panel, Table, Tabs } from '../ui';
import { useWorkspace } from '../workspace';

const views = { checklist: 'Setup checklist', verify: 'Verification', readiness: 'Unit readiness' };

export function SetupPage() {
  const { setup, units, go, unitLabel, recordId, section, notify } = useWorkspace();
  const [page, setPage] = useState(1);
  const selected = views[(recordId || section) as keyof typeof views] ?? views.checklist;
  const first = units[0];
  const steps = [
    { label: 'About you', detail: 'Workspace name, verified phone, city and host profile.', done: setup.steps.profile, open: () => go('settings') },
    { label: 'First unit', detail: 'Address and check-in details for the first unit.', done: setup.steps.unit, open: () => go('properties') },
    { label: 'Delivery handoff', detail: 'Set the handoff rule and confirm the contact.', done: setup.steps.handoff, open: () => first ? go('unit', first.id, 'access') : go('properties') },
    { label: 'Guests & packages', detail: 'Welcome packages, billing and guest preferences.', done: setup.steps.packages, open: () => go('operations','packages') },
    { label: 'Verify & go live', detail: 'Ask NexG to verify your listing.', done: setup.steps.verification, open: () => go('setup','','verify') },
  ];
  const readiness = setup.readiness.filter(row => units.some(unit => unit.id === row.unitId));
  const pageSize = 6;
  const current = Math.max(1, Math.min(page, Math.ceil(readiness.length / pageSize)));
  const flag = (value: boolean) => <Badge tone={value ? 'success' : 'neutral'}>{value ? 'Ready' : 'Pending'}</Badge>;

  return (
    <div className="management-page">
      <PageHeader title="Setup & verification" subtitle="Check your listing approval and what each unit needs before it goes live.">
        <Button onClick={() => go('overview')}><Icon name="left" size={16}/>Overview</Button>
      </PageHeader>
      <Tabs items={Object.values(views)} value={selected} onChange={value =>
        go('setup','',''+Object.keys(views).find(key => views[key as keyof typeof views] === value))}/>
      {selected === views.checklist ? <Panel className="mg-fill-panel">
        <div className="mg-panel-heading"><h2>Workspace setup</h2><Badge>{steps.filter(step => step.done).length} of {steps.length} complete</Badge></div>
        <Table><thead><tr><th>Step</th><th>Details</th><th>State</th><th>Action</th></tr></thead>
          <tbody>{steps.map(step => <tr key={step.label}><td><strong>{step.label}</strong></td><td>{step.detail}</td><td>{flag(step.done)}</td><td><Button onClick={step.open}>Open</Button></td></tr>)}</tbody>
        </Table>
      </Panel> : selected === views.readiness ? <Panel className="mg-fill-panel">
        <div className="mg-panel-heading"><h2>Unit readiness</h2><p>See each check required for a unit to go live.</p></div>
        <Table><thead><tr><th>Unit</th><th>Address</th><th>Handoff</th><th>Contact</th><th>Hours</th><th>QR placed</th></tr></thead>
          <tbody>{readiness.slice((current-1)*pageSize,current*pageSize).map(row => <tr key={row.unitId}>
            <td><Button variant="ghost" onClick={() => go('unit',row.unitId,'access')}>{unitLabel(row.unitId)}</Button></td>
            <td>{flag(row.address)}</td><td>{flag(row.handoff)}</td><td>{flag(row.contact)}</td><td>{flag(row.hours)}</td><td>{flag(row.qr)}</td>
          </tr>)}</tbody>
        </Table>
        {!readiness.length && <Empty title="No units in this view" description="Add a unit or choose another property."/>}
        <Pager page={current} total={readiness.length} pageSize={pageSize} onChange={setPage}/>
      </Panel> : <Panel className="mg-fill-panel">
        <div className="mg-panel-heading"><h2>{setup.live ? 'Your listing is verified' : 'Verify & go live'}</h2><Badge tone={setup.live ? 'success' : 'warning'}>{setup.status}</Badge></div>
        {setup.live ? <p className="mg-small-note">NexG verified your account{setup.verifiedAt ? ' on '+dateText(setup.verifiedAt) : ''}. Each unit goes live after its readiness checks.</p> : <>
          {setup.submittedAt && <p className="mg-small-note">Submitted {dateText(setup.submittedAt)}{setup.verificationMethod ? ' · '+setup.verificationMethod.replaceAll('_',' ') : ''}. NexG reviews your proof.</p>}
          <div className="mg-panel-heading"><h2>Paste a code into your listing</h2></div>
          <p className="mg-small-note">Add your code to the listing description for 24 hours so NexG can verify it.</p>
          {setup.verificationCode && <div className="mg-row-actions"><strong>{setup.verificationCode}</strong><Button onClick={async () => {
            try { await navigator.clipboard.writeText(setup.verificationCode ?? ''); notify('Verification code copied.'); }
            catch { notify('Select the code to copy it.'); }
          }}>Copy code</Button></div>}
          <p className="mg-small-note">You can also send a screenshot of your listing dashboard or arrange a five-minute verification call.</p>
          <div className="mg-row-actions"><Button variant="primary" onClick={() => go('inbox','new')}>Contact NexG to submit proof</Button></div>
        </>}
      </Panel>}
    </div>
  );
}
