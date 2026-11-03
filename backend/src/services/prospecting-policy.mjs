import {DEFAULT_SETTINGS} from './digitale-ai-settings.mjs';
export const OWNER = 'fba75bd9-8f92-4e2b-83f9-3bc48d7fa4bd';
export const HOURLY_TARGET = 16;
export const DAILY_TARGET = 160;
export function windowAt(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23'}).formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  const hour = Number(part('hour'));
  // Derive boundaries from the timezone formatter, without assuming a UTC offset.
  const localHour = new Date(now);
  localHour.setUTCMinutes(0,0,0);
  const dateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
  const localDate=t=>{const p=dateFormatter.formatToParts(new Date(t));return ['year','month','day'].map(k=>p.find(v=>v.type===k).value).join('-');};
  let low=now.getTime()-36*3600000,high=now.getTime();
  while(high-low>1){const middle=Math.floor((low+high)/2);if(localDate(middle)<date)low=middle;else high=middle;}
  const dayStart = new Date(high);
  return {date, hour, open:hour >= 8 && hour < 18, hourStart:localHour, dayStart};
}
export const sqlDate = date => date.toISOString().slice(0,23).replace('T',' ');
export function quota(hourCount, dayCount, now = new Date(), settings=DEFAULT_SETTINGS) {
  return settings.enabled && windowAt(now).open ? Math.max(0,Math.min(settings.hourly_target-hourCount, settings.daily_target-dayCount)) : 0;
}
export function nextRun(now = new Date()) {
  let candidate = new Date(Math.ceil((now.getTime()+1000)/60000)*60000);
  for(let i=0;i<1500;i++,candidate=new Date(candidate.getTime()+60000)) if(windowAt(candidate).open) return candidate;
  throw Error('schedule_unavailable');
}
