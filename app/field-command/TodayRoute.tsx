"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { nyToday } from '../../lib/appointments';
import { drivingLink } from '../../lib/driving-link';
import { eligibleRouteJobs, planDay, routeTime, scheduleStops, validRouteSettings, type RouteJob, type RoutePoint, type RouteSettings } from '../../lib/day-route';

const KEY='hpd-today-route-v1';
export default function TodayRoute({jobs,mapReady,getOrigin,onPreview,onSelect,onNavigate}: {jobs:RouteJob[];mapReady:boolean;getOrigin:()=>{point:RoutePoint;label:string};onPreview:(jobs:RouteJob[],origin:RoutePoint)=>void;onSelect:(id:string)=>void;onNavigate:(id:string)=>void}) {
  const [open,setOpen]=useState(false);
  const [settings,setSettings]=useState<RouteSettings>({date:nyToday(),start:'08:00',end:'17:00',minutes:45,borough:'ALL'});
  const [ids,setIds]=useState<string[]>([]);
  const [origin,setOrigin]=useState<{point:RoutePoint;label:string}|null>(null);
  const [ready,setReady]=useState(false);
  const [message,setMessage]=useState('');
  const bodyRef=useRef<HTMLDivElement>(null);
  const lastSaved=useRef('');
  const preview=useRef(onPreview); preview.current=onPreview;
  useEffect(()=>{lastSaved.current=JSON.stringify({settings,ids,origin});try {const saved=JSON.parse(localStorage.getItem(KEY)||'null'); if(saved && validRouteSettings(saved.settings) && Array.isArray(saved.ids) && saved.ids.every((id:unknown)=>typeof id==='string')) {setSettings(saved.settings);setIds([...new Set<string>(saved.ids)]);if(Number.isFinite(saved.origin?.point?.lat)&&Number.isFinite(saved.origin?.point?.lng)&&typeof saved.origin?.label==='string')setOrigin(saved.origin);}} catch {setMessage('Saved route could not be read.');} setReady(true);},[]);
  useEffect(()=>{if(!ready||!validRouteSettings(settings))return;const text=JSON.stringify({settings,ids,origin});if(text===lastSaved.current)return;try{localStorage.setItem(KEY,text);lastSaved.current=text;setMessage('Saved on this device');}catch{setMessage('Route could not be saved. Keep this page open.');}},[settings,ids,origin,ready]);
  const eligible=useMemo(()=>eligibleRouteJobs(jobs,settings),[jobs,settings]);
  const selected=useMemo(()=>ids.map(id=>eligible.find(j=>j.id===id)).filter((j):j is RouteJob=>!!j),[ids,eligible]);
  const stops=useMemo(()=>origin?scheduleStops(selected,settings,origin.point):[],[selected,settings,origin]);
  useEffect(()=>{if(origin&&mapReady)preview.current(selected,origin.point);},[selected,origin,mapReady]);
  function build(){if(!validRouteSettings(settings))return;const start=origin||getOrigin();setOrigin(start);setIds(planDay(jobs,settings,start.point).map(j=>j.id));requestAnimationFrame(()=>bodyRef.current?.scrollTo({top:0}));}
  function move(index:number,delta:number){const next=selected.map(j=>j.id);[next[index],next[index+delta]]=[next[index+delta],next[index]];setIds(next);}
  return <aside className={`fc-today-route ${open?'is-open':''}`} aria-label="Today's route">
    <button className="fc-route-toggle" type="button" aria-expanded={open} onClick={()=>{setOpen(!open);if(!origin)setOrigin(getOrigin());}}>Today&apos;s route {selected.length?`(${selected.length})`:''}<span aria-hidden="true">{open?'⌄':'⌃'}</span></button>
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
      <p>{origin?.label || 'Map center'} · New York time · Estimated travel/work times, no live traffic. Line is stop order, not a road route.</p>
      </details>
      {ids.length>0&&<p>Estimated times · Stop order, not a road route</p>}
      {selected[0]&&drivingLink(selected[0])&&<a className="fc-route-drive" href={drivingLink(selected[0])!} onClick={()=>onNavigate(selected[0].id)} target="_blank" rel="noreferrer">Navigate next stop · {selected[0].id}<small>Google Maps · Driving directions</small></a>}
      {stops.some(s=>s.warning)&&<p role="alert">Route needs review: appointment or workday conflicts below.</p>}
      <ol>{stops.map((stop,index)=><li key={stop.job.id}>
        <button className="fc-route-stop" type="button" onClick={()=>{setOpen(false);onSelect(stop.job.id);}}><b>{index+1}. {stop.job.id}</b><span>{stop.job.address}</span><span>{routeTime(stop.arrival)}-{routeTime(stop.finish)} · {stop.travel} min travel est.</span><span>{stop.job.appointment?.state==='confirmed'?`Appointment ${stop.job.appointment.start}-${stop.job.appointment.end}`:stop.job.days===null?'Maturity unavailable':stop.job.days>0?`${stop.job.days} days overdue`:`Due in ${-stop.job.days} days`}</span></button>
        {stop.warning&&<strong role="alert">{stop.warning}</strong>}
        <div className="fc-route-stop-actions"><button type="button" title="Move stop earlier" aria-label={`Move ${stop.job.id} earlier`} disabled={index===0} onClick={()=>move(index,-1)}>↑</button><button type="button" title="Move stop later" aria-label={`Move ${stop.job.id} later`} disabled={index===stops.length-1} onClick={()=>move(index,1)}>↓</button><button type="button" onClick={()=>setIds(ids.filter(id=>id!==stop.job.id))}>Skip</button><a href={drivingLink(stop.job)||undefined} onClick={()=>onNavigate(stop.job.id)} target="_blank" rel="noreferrer">Navigate</a></div>
      </li>)}</ol>
      {!stops.length&&<p>No planned stops. Build a route or choose another area.</p>}
      {selected.length<ids.length&&<p>{ids.length-selected.length} saved stops unavailable or no longer eligible.</p>}
      <label>Add stop<select aria-label="Add route stop" value="" onChange={e=>{if(e.target.value)setIds([...ids,e.target.value]);}}><option value="">Select job</option>{eligible.filter(j=>!ids.includes(j.id)).map(j=><option key={j.id} value={j.id}>{j.id} · {j.address}</option>)}</select></label>
      <p role="status">{message}</p>
      <a href="/storage/">Drive backup / recovery</a>
      {ids.length>0&&<button type="button" className="fc-route-toggle" onClick={()=>setIds([])}>Clear route</button>}
    </div>}
  </aside>;
}
