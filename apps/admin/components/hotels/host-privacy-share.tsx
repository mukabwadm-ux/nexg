'use client';

import { useState } from 'react';
import { listHostPrivacyShares, setHostPrivacyShare } from '@/app/hotels/actions';

export function HostPrivacyShare({requestId}:{requestId:string}) {
  const [rows,setRows]=useState<Array<{host_id:string;host_name:string;shared:boolean}>|null>(null);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');

  async function load() {
    const result=await listHostPrivacyShares(requestId);
    if (result.error) setError(result.error);
    else setRows(result.rows ?? []);
  }

  async function run(task:()=>Promise<void>) {
    if(pending)return;
    setPending(true);setError('');
    try{await task();}
    catch{setError('Host status sharing could not be reached.');}
    finally{setPending(false);}
  }

  return <div className="min-w-36 space-y-2 text-xs">
    <button type="button" disabled={pending} className="border-border rounded-md border px-2 py-1 font-bold"
      onClick={()=>rows?setRows(null):void run(load)}>{rows?'Close':'Host status sharing'}</button>
    {error&&<p role="alert">{error}</p>}
    {rows?.length===0&&<p>Verified identity and linked guest activity are needed.</p>}
    {rows?.map(host=><div key={host.host_id} className="space-y-1">
      <p>{host.host_name}</p>
      <button type="button" disabled={pending} className="border-border rounded-md border px-2 py-1 font-bold"
        onClick={()=>void run(async()=>{
          const result=await setHostPrivacyShare(requestId,host.host_id,!host.shared);
          if(result.error)setError(result.error);
          else await load();
        })}>{host.shared?'Stop sharing':'Share status'}</button>
    </div>)}
  </div>;
}
