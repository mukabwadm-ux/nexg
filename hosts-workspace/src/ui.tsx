import {useWorkspace} from './workspace';
import type {ButtonHTMLAttributes,ReactNode} from 'react';
import {HugeiconsIcon} from '@hugeicons/react';
import {Home01Icon,House03Icon,Calendar03Icon,Message01Icon,Task01Icon,Coins01Icon,ChartIcon,Settings01Icon,HelpCircleIcon,Notification01Icon,Search01Icon,Add01Icon,ArrowLeft01Icon,ArrowRight01Icon,Cancel01Icon,Tick01Icon,Book01Icon,QrCodeIcon,UserIcon,Logout01Icon,Download01Icon,Upload01Icon,AttachmentIcon,SentIcon,Wrench01Icon,CleanIcon,PackageIcon,BookOpen01Icon,CreditCardIcon,File01Icon,LaptopIcon,PaintBrush04Icon,Shield01Icon,UserMultipleIcon} from '@hugeicons/core-free-icons';
const icons={home:Home01Icon,building:House03Icon,calendar:Calendar03Icon,message:Message01Icon,task:Task01Icon,money:Coins01Icon,chart:ChartIcon,settings:Settings01Icon,help:HelpCircleIcon,notification:Notification01Icon,search:Search01Icon,add:Add01Icon,left:ArrowLeft01Icon,right:ArrowRight01Icon,close:Cancel01Icon,check:Tick01Icon,book:Book01Icon,qr:QrCodeIcon,user:UserIcon,logout:Logout01Icon,download:Download01Icon,upload:Upload01Icon,attachment:AttachmentIcon,send:SentIcon,repair:Wrench01Icon,cleaning:CleanIcon,delivery:PackageIcon,package:PackageIcon,guide:BookOpen01Icon,card:CreditCardIcon,file:File01Icon,device:LaptopIcon,brush:PaintBrush04Icon,shield:Shield01Icon,team:UserMultipleIcon};
export function Icon({name,size=21,className=''}:{name:string;size?:number;className?:string}){
  if(name==='bed')return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} color="currentColor" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className={className} aria-hidden="true">
    <path d="M22 17.5H2" strokeLinejoin="round"/>
    <path d="M22 21V16C22 14.1144 22 13.1716 21.4142 12.5858C20.8284 12 19.8856 12 18 12H6C4.11438 12 3.17157 12 2.58579 12.5858C2 13.1716 2 14.1144 2 16V21" strokeLinejoin="round"/>
    <path d="M11 12V10.2134C11 9.83272 10.9428 9.70541 10.6497 9.55538C10.0395 9.24292 9.29865 9 8.5 9C7.70135 9 6.96055 9.24292 6.35025 9.55538C6.05721 9.70541 6 9.83272 6 10.2134L6 12"/>
    <path d="M18 12V10.2134C18 9.83272 17.9428 9.70541 17.6497 9.55538C17.0395 9.24292 16.2987 9 15.5 9C14.7013 9 13.9605 9.24292 13.3503 9.55538C13.0572 9.70541 13 9.83272 13 10.2134L13 12"/>
    <path d="M21 12V7.36057C21 6.66893 21 6.32311 20.8079 5.99653C20.6157 5.66995 20.342 5.50091 19.7944 5.16283C17.5869 3.79978 14.8993 3 12 3C9.10067 3 6.41314 3.79978 4.20558 5.16283C3.65804 5.50091 3.38427 5.66995 3.19213 5.99653C3 6.32311 3 6.66893 3 7.36057V12"/>
  </svg>;
  return <HugeiconsIcon icon={icons[name as keyof typeof icons]||Task01Icon} size={size} strokeWidth={1.6} className={className} aria-hidden="true"/>;
}
export function Button({children,variant='secondary',className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'ghost'}){return <button type="button" className={`btn btn-${variant} ${className}`} {...props}>{children}</button>;}
export function Badge({children,tone='neutral'}:{children:ReactNode;tone?:'success'|'warning'|'danger'|'info'|'neutral'}){return <span className={`badge badge-${tone}`}>{children}</span>;}
export function Panel({children,className=''}:{children:ReactNode;className?:string}){return <section className={`panel ${className}`}>{children}</section>;}
export function Tabs({items,value,onChange}:{items:string[];value:string;onChange:(v:string)=>void}){return <div className="tabs" role="tablist">{items.map(item=><button type="button" key={item} role="tab" aria-selected={value===item} className={value===item?'active':''} onClick={()=>onChange(item)}>{item}</button>)}</div>;}
export function PageHeader({title,subtitle,children}:{title:string;subtitle?:string;children?:ReactNode}){return <div className="page-header"><div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div><div className="page-actions">{children}</div></div>;}
export function Table({children,className=''}:{children:ReactNode;className?:string}){return <div className={`table-scroll ${className}`} tabIndex={0}><table>{children}</table></div>;}
export function Empty({title,description,children}:{title:string;description?:string;children?:ReactNode}){return <div className="empty"><Icon name="search" size={30}/><h3>{title}</h3>{description&&<p>{description}</p>}{children}</div>;}
export function Pager({page,total,pageSize,onChange}:{page:number;total:number;pageSize:number;onChange:(p:number)=>void}){const max=Math.max(1,Math.ceil(total/pageSize));return <div className="pager"><span>{total?`${(page-1)*pageSize+1}–${Math.min(page*pageSize,total)} of ${total}`:'No records'}</span><div><Button aria-label="Previous page" disabled={page<=1} onClick={()=>onChange(page-1)}><Icon name="left" size={16}/></Button><span>{page} / {max}</span><Button aria-label="Next page" disabled={page>=max} onClick={()=>onChange(page+1)}><Icon name="right" size={16}/></Button></div></div>;}
export function Avatar({name,size=35}:{name:string;size?:number}){return <span className="avatar" style={{width:size,height:size,fontSize:size*.34}} aria-label={name}>{name.split(' ').map(s=>s[0]).slice(0,2).join('')}</span>;}
export function Sparkline(){return <svg className="sparkline" viewBox="0 0 110 42" aria-hidden="true"><path d="M2 34Q13 22 24 28T44 19T64 20T84 11T107 5" fill="none" stroke="currentColor" strokeWidth="2.5"/><path d="M2 34Q13 22 24 28T44 19T64 20T84 11T107 5V42H2Z" fill="currentColor" opacity=".09"/></svg>;}
export function Metric({label,value,icon='money',note,spark=false}:{label:string;value:ReactNode;icon?:string;note?:ReactNode;spark?:boolean}){return <Panel className="metric"><div className="metric-label"><Icon name={icon}/>{label}</div><strong>{value}</strong>{note&&<small>{note}</small>}{spark&&<Sparkline/>}</Panel>;}
export function PropertyPhoto({index,src,className='',alt=''}:{index?:number;src?:string;className?:string;alt?:string}) {
  const {data}=useWorkspace();
  const image=src || (index===undefined ? '' : data.properties[index]?.image);
  return <div className={`property-photo ${className}`}>{image?<img src={image} alt={alt}/>:<Icon name="building" size={22}/>}</div>;
}
export function downloadFile(name:string,content:string,mime='text/csv'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:mime}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);}
export function csv(rows:unknown[][]){return rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');}
