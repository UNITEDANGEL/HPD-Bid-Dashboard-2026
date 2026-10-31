"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { nyToday } from '../../lib/appointments';
import { drivingLink, routeLink, wazeLink } from '../../lib/driving-link';
import type { RoadRoute } from '../../lib/road-route';
import { eligibleRouteJobs, planDay, routeTime, scheduleStops, validRouteSettings, type RouteJob, type RoutePoint, type RouteSettings } from '../../lib/day-route';

const KEY='hpd-today-route-v1';
export default function TodayRoute({jobs,mapReady,getOrigin,onPreview,onSelect,onNavigate,openRequest=0,closeRequest=0,buildRequest=0,onOpenChange}: {buildRequest?:number;jobs:RouteJob[];mapReady:boolean;getOrigin:()=>{point:RoutePoint;label:string};onPreview:(jobs:RouteJob[],origin:RoutePoint,numbers?:number[],done?:RouteJob[])=>Promise<RoadRoute|null>|void;onSelect:(id:string)=>void;onNavigate:(id:string)=>void;openRequest?:number;closeRequest?:number;onOpenChange?:(open:boolean)=>void}) {
  const [open,setOpen]=useState(false);
  // Another map button opened its own screen: close the route panel. The map knows whether it's open.
  useEffect(()=>{if(closeRequest)setOpen(false);},[closeRequest]);
  useEffect(()=>{onOpenChange?.(open);},[open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [settings,setSettings]=useState<RouteSettings>({date:nyToday(),start:'08:00',end:'17:00',minutes:45,borough:'ALL'});
  const [ids,setIds]=useState<string[]>([]);
  const [origin,setOrigin]=useState<{point:RoutePoint;label:string}|null>(null);
  const [ready,setReady]=useState(false);
  const [message,setMessage]=useState('');
  // The street route for the current stops: real driving time per leg (null: no signal, straight estimate).
  const [road,setRoad]=useState<RoadRoute|null|'loading'>(null);
  const bodyRef=useRef<HTMLDivElement>(null);
  const lastSaved=useRef('');
  const preview=useRef(onPreview); preview.current=onPreview;
  function loadSaved(){try {const saved=JSON.parse(localStorage.getItem(KEY)||'null'); if(saved && validRouteSettings(saved.settings) && Array.isArray(saved.ids) && saved.ids.every((id:unknown)=>typeof id==='string')) {setSettings(saved.settings);setIds([...new Set<string>(saved.ids)]);if(Number.isFinite(saved.origin?.point?.lat)&&Number.isFinite(saved.origin?.point?.lng)&&typeof saved.origin?.label==='string')setOrigin(saved.origin);}} catch {setMessage('Saved route could not be read.');}}
  useEffect(()=>{lastSaved.current=JSON.stringify({settings,ids,origin});loadSaved();setReady(true);},[]); // eslint-disable-line react-hooks/exhaustive-deps
  // A stop added or taken off from the job card or by voice (30 Oct) is read back in, so it isn't saved over.
  useEffect(()=>{const reload=()=>loadSaved();window.addEventListener('hpd-route-changed',reload);return()=>window.removeEventListener('hpd-route-changed',reload);},[]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(!ready||!validRouteSettings(settings))return;const text=JSON.stringify({settings,ids,origin});if(text===lastSaved.current)return;try{localStorage.setItem(KEY,text);lastSaved.current=text;setMessage('Saved on this device');}catch{setMessage('Route could not be saved. Keep this page open.');}},[settings,ids,origin,ready]);
  const eligible=useMemo(()=>eligibleRouteJobs(jobs,settings),[jobs,settings]);
  const selected=useMemo(()=>ids.map(id=>eligible.find(j=>j.id===id)).filter((j):j is RouteJob=>!!j),[ids,eligible]);
  // Finished today: they stay on the route with a ✓ and keep their stop numbers.
  const done=useMemo(()=>ids.map(id=>jobs.find(j=>j.id===id)).filter((j):j is RouteJob=>!!j?.done),[ids,jobs]);
  const numbers=useMemo(()=>selected.map(j=>ids.indexOf(j.id)+1),[selected,ids]);
  const roadRoute=road&&road!=='loading'&&road.legs.length===selected.length?road:null;
  const stops=useMemo(()=>origin?scheduleStops(selected,settings,origin.point,roadRoute?.legs.map(l=>l.minutes)):[],[selected,settings,origin,roadRoute]);
  useEffect(()=>{if(!origin||!mapReady)return;let current=true;setRoad(selected.length?'loading':null);Promise.resolve(preview.current(selected,origin.point,numbers,done)).then(r=>{if(current)setRoad(r||null);});return()=>{current=false;};},[selected,origin,mapReady,done]); // eslint-disable-line react-hooks/exhaustive-deps
  // The route button on the map: open the panel and plan the day if nothing is planned yet.
  const builtFor=useRef(0);
  useEffect(()=>{if(!openRequest||!ready||builtFor.current===openRequest)return;builtFor.current=openRequest;setOpen(true);if(!origin)setOrigin(getOrigin());if(!ids.length&&mapReady)build();else showRoute();},[openRequest,ready,mapReady]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Plan my day" by voice (22 Oct): open the panel and plan it fresh (finished stops stay).
  const builtByVoice=useRef(0);
  useEffect(()=>{if(!buildRequest||!ready||!mapReady||builtByVoice.current===buildRequest)return;builtByVoice.current=buildRequest;setOpen(true);build();},[buildRequest,ready,mapReady]); // eslint-disable-line react-hooks/exhaustive-deps
  // Re-draw the saved route, which also zooms the map to show all of it (the street line is remembered).
  function showRoute(){if(origin&&mapReady&&(selected.length||done.length))Promise.resolve(preview.current(selected,origin.point,numbers,done)).then(r=>setRoad(r||null));}
  function build(){if(!validRouteSettings(settings))return;const start=getOrigin();setOrigin(start);const kept=done.map(j=>j.id);setIds([...kept,...planDay(jobs,settings,start.point).map(j=>j.id).filter(id=>!kept.includes(id))]);requestAnimationFrame(()=>bodyRef.current?.scrollTo({top:0}));}
  // Swap two open stops in place; finished stops stay where they are.
  function move(index:number,delta:number){const a=ids.indexOf(selected[index].id),b=ids.indexOf(selected[index+delta].id);if(a<0||b<0)return;const next=[...ids];[next[a],next[b]]=[next[b],next[a]];setIds(next);}
  return <aside className={`fc-today-route ${open?'is-open':''}`} aria-label="Today's route">
    <button className="fc-route-toggle" type="button" aria-expanded={open} onClick={()=>{setOpen(!open);if(!origin)setOrigin(getOrigin());else if(!open)showRoute();}}>Today&apos;s route {done.length?`(${done.length}/${selected.length+done.length} done)`:selected.length?`(${selected.length})`:''}<span aria-hidden="true">{open?'⌄':'⌃'}</span></button>
    {open&&<div className="fc-route-body" ref={bodyRef}>
      <details open={!ids.length}><summary>Plan settings · {settings.start}-{settings.end}</summary><div className="fc-route-settings">
        <label>Day<input aria-label="Route day" type="date" value={settings.date} onChange={e=>setSettings({...settings,date:e.target.value})}/></label>
        <label>Area<select aria-label="Route area" value={settings.borough} onChange={e=>setSettings({...settings,borough:e.target.value})}><option value="ALL">All boroughs</option>{Object.entries({MN:'Manhattan',BK:'Brooklyn',QN:'Queens',BX:'Bronx',SI:'Staten Island'}).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label>Start<input aria-label="Route start" type="time" value={settings.start} onChange={e=>setSettings({...settings,start:e.target.value})}/></label>
        <label>Finish<input aria-label="Route finish" type="time" value={settings.end} onChange={e=>setSettings({...settings,end:e.target.value})}/></label>
        <label>Minutes per job<input aria-label="Minutes per job" type="number" min="15" max="240" step="15" value={settings.minutes} onChange={e=>setSettings({...settings,minutes:Number(e.target.value)})}/></label>
      </div>
      {!validRouteSettings(settings)&&<p role="alert">Choose a valid day, finish after start, and 15-240 minutes per job.</p>}
      {settings.date<nyToday()&&<p role="status">Saved plan is from a previous day. Choose today and rebuild.</p>}
      <button className="fc-next-action" type="button" disabled={!mapReady||!validRouteSettings(settings)} onClick={build}>{ids.length?'Rebuild route':'Build route'}</button>
      <button type="button" className="fc-route-toggle" onClick={()=>setOrigin(getOrigin())}>Update start from location / map</button>
      <p>Starts from {origin?.label || 'map center'} · New York time · {settings.minutes} min per job</p>
      </details>
      {ids.length>0&&<p className="fc-route-total" data-hpd-smoke="fc-route-total">{roadRoute?`🚗 Road route · ${roadRoute.miles.toFixed(1)} mi · ${roadRoute.minutes} min driving (no live traffic)`:road==='loading'?'Finding the road route…':'No signal for the road route right now · times are estimates · Google Maps still gives turn-by-turn'}</p>}
      {origin&&selected.length>0&&routeLink([origin.point,...selected])&&<a className="fc-route-drive fc-route-all" data-hpd-smoke="fc-route-all" href={routeLink([origin.point,...selected])!} target="_blank" rel="noreferrer">Open whole route in Google Maps<small>All {selected.length} stops in this order</small></a>}
      {selected[0]&&drivingLink(selected[0])&&<div className="fc-route-next" data-hpd-smoke="fc-route-next"><p>Next stop · {selected[0].id}</p><div><a className="fc-route-drive fc-route-waze" data-hpd-smoke="fc-route-next-waze" href={wazeLink(selected[0])!} onClick={()=>onNavigate(selected[0].id)} target="_blank" rel="noreferrer">Waze</a><a className="fc-route-drive" data-hpd-smoke="fc-route-next-google" href={drivingLink(selected[0])!} onClick={()=>onNavigate(selected[0].id)} target="_blank" rel="noreferrer">Google Maps</a></div></div>}
      {stops.some(s=>s.warning)&&<p role="alert">Route needs review: appointment or workday conflicts below.</p>}
      {done.length>0&&<p className="fc-route-progress" data-hpd-smoke="fc-route-progress">✓ {done.length} of {selected.length+done.length} done{selected.length?` · ${selected.length} to go`:' · route finished'}</p>}
      <ol>{ids.map(id=>{const d=done.find(j=>j.id===id);if(!d)return null;return <li key={id} className="fc-route-done-row" data-hpd-smoke="fc-route-done-row"><button className="fc-route-stop" type="button" onClick={()=>{setOpen(false);onSelect(id);}}><b>✓ {ids.indexOf(id)+1}. {id}</b><span>{d.address}</span><span>{d.done!.label} · {new Date(d.done!.at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})}</span></button></li>;})}
      {stops.map((stop,index)=><li key={stop.job.id}>
        <button className="fc-route-stop" type="button" onClick={()=>{setOpen(false);onSelect(stop.job.id);}}><b>{numbers[index]}. {stop.job.id}</b><span>{stop.job.address}</span><span>{routeTime(stop.arrival)}-{routeTime(stop.finish)} · {roadRoute?`${roadRoute.legs[index].minutes} min drive · ${roadRoute.legs[index].miles.toFixed(1)} mi`:`${stop.travel} min travel est.`}</span><span>{stop.job.appointment?.state==='confirmed'?`Appointment ${stop.job.appointment.start}-${stop.job.appointment.end}`:stop.job.days===null?'Maturity unavailable':stop.job.days>0?`${stop.job.days} days overdue`:`Due in ${-stop.job.days} days`}</span>{stop.job.secondTry?<span className="fc-route-contact is-second" data-hpd-smoke="fc-route-second-try">🔒 2nd try (no access {stop.job.secondTry.first}): knock again</span>:stop.job.contact?<span className={`fc-route-contact is-${stop.job.contact.tone}`} data-hpd-smoke="fc-route-contact">{stop.job.contact.tone==='ok'?'✅ Tenant reached':stop.job.contact.tone==='common'?'🏢 Public area: no tenant':stop.job.contact.tone==='try'?`🟡 Tenant not reached (${stop.job.contact.tries} ${stop.job.contact.tries===1?'try':'tries'}): access attempt`:'🔴 Tenant not contacted yet: call first'}</span>:null}</button>
        {stop.warning&&<strong role="alert">{stop.warning}</strong>}
        <div className="fc-route-stop-actions"><button type="button" title="Move stop earlier" aria-label={`Move ${stop.job.id} earlier`} disabled={index===0} onClick={()=>move(index,-1)}>↑</button><button type="button" title="Move stop later" aria-label={`Move ${stop.job.id} later`} disabled={index===stops.length-1} onClick={()=>move(index,1)}>↓</button><button type="button" onClick={()=>setIds(ids.filter(id=>id!==stop.job.id))}>Skip</button>{/* The next stop's Waze / Google are in "Next stop" above: not twice (owner, 22 Oct). */}{index>0||!drivingLink(stop.job)?<><a href={wazeLink(stop.job)||undefined} onClick={()=>onNavigate(stop.job.id)} target="_blank" rel="noreferrer">Waze</a><a href={drivingLink(stop.job)||undefined} onClick={()=>onNavigate(stop.job.id)} target="_blank" rel="noreferrer">Google</a></>:null}</div>
      </li>)}</ol>
      {!stops.length&&!done.length&&<p>No planned stops. Build a route or choose another area.</p>}
      {selected.length+done.length<ids.length&&<p>{ids.length-selected.length-done.length} saved stops unavailable or no longer eligible.</p>}
      <label>Add stop<select aria-label="Add route stop" value="" onChange={e=>{if(e.target.value)setIds([...ids,e.target.value]);}}><option value="">Select job</option>{eligible.filter(j=>!ids.includes(j.id)).map(j=><option key={j.id} value={j.id}>{j.id} · {j.address}</option>)}</select></label>
      <p role="status">{message}</p>
      <a href="/storage/">Drive backup / recovery</a>
      {ids.length>0&&<button type="button" className="fc-route-toggle" onClick={()=>setIds([])}>Clear route</button>}
    </div>}
  </aside>;
}
