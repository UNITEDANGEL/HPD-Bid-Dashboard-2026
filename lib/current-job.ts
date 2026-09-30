export const CURRENT_JOB_KEY = 'hpd-current-job-v1';
export type CurrentJob = { id:string; startedAt:number; pendingReturn:boolean };
export function parseCurrentJob(raw:string|null, now=Date.now()):CurrentJob|null {
  try {
    const value=JSON.parse(raw||'null');
    if(!value || typeof value.id!=='string' || !/^[A-Z]{1,3}\d{4,8}$/.test(value.id) || !Number.isFinite(value.startedAt) || value.startedAt>now || now-value.startedAt>86400000 || typeof value.pendingReturn!=='boolean')return null;
    return {id:value.id,startedAt:value.startedAt,pendingReturn:value.pendingReturn};
  } catch {return null;}
}
