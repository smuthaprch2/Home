const ical = require("node-ical");

const ROUTER_URL = (process.env.ROUTER_URL || "https://huggins-discord-alert-router.onrender.com").replace(/\\\/$/, "");
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || "";
const TODOIST_API_TOKEN = process.env.TODOIST_API_TOKEN || "";
const TODOIST_PROJECT_IDS = new Set(String(process.env.TODOIST_PROJECT_IDS || "").split(",").map(v => v.trim()).filter(Boolean));
const FAMILY_TIMEZONE = process.env.FAMILY_TIMEZONE || "America/New_York";

function parseUrlList(raw) {
  if (!raw) return [];
  const t = raw.trim();
  if (!t) return [];
  if (t.startsWith("[")) {
    try { const arr = JSON.parse(t); if (Array.isArray(arr)) return arr.map(String).map(v => v.trim()).filter(Boolean); } catch {}
  }
  return t.split(/\\n|\\|\\|/).map(v => v.trim()).filter(Boolean);
}

const CALENDAR_ICAL_URLS = parseUrlList(process.env.CALENDAR_ICAL_URLS || "");

function clip(value, max=1000) { return String(value || "").replace(/\\s+/g, " ").trim().slice(0,max); }

function localParts(date, timeZone=FAMILY_TIMEZONE) {
  const fmt = new Intl.DateTimeFormat("en-US", {timeZone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false});
  return Object.fromEntries(fmt.formatToParts(date).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
}
function localDateKey(date, timeZone=FAMILY_TIMEZONE) { const p=localParts(date,timeZone); return p.year+"-"+p.month+"-"+p.day; }

function classifyCalendar(summary) {
  const s=String(summary||"").toLowerCase();
  const p1=/(deadline|flight|airport|doctor|dr\\.|appointment|bid|book|travel|trip|cup|tournament|exam|payment due|award|no school|closed)/;
  const p2=/(soccer|volleyball|practice|lesson|meeting|school|church|club|showcase)/;
  if (p1.test(s)) return {level:"P1", severity:"warning", targets:[1440,120,30]};
  if (p2.test(s)) return {level:"P2", severity:"notice", targets:[1440,120]};
  return {level:"P3", severity:"info", targets:[1440]};
}
function dueTrigger(minutesUntil, targets) { for (const t of targets) if (Math.abs(minutesUntil-t)<=18) return t; return null; }

async function routeAlert(body) {
  if (!BRIDGE_TOKEN) throw new Error("BRIDGE_TOKEN missing");
  const res=await fetch(ROUTER_URL+"/alert",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+BRIDGE_TOKEN},body:JSON.stringify(body)});
  const tx=await res.text();
  if (!res.ok) throw new Error("router_"+res.status+":"+tx.slice(0,300));
  return tx;
}

function eventOccurrences(event, windowStart, windowEnd) {
  const out=[];
  if (event.rrule && typeof event.rrule.between==="function") { for (const d of event.rrule.between(windowStart,windowEnd,true)) out.push(d); }
  else if (event.start instanceof Date && event.start>=windowStart && event.start<=windowEnd) out.push(event.start);
  return out;
}

async function pollCalendars() {
  if (!CALENDAR_ICAL_URLS.length) { console.log("calendar bridge: CALENDAR_ICAL_URLS not configured"); return; }
  const now=new Date(); const lookahead=new Date(now.getTime()+26*60*60*1000); let sent=0;
  for (let idx=0; idx<CALENDAR_ICAL_URLS.length; idx++) {
    let data; try { data=await ical.async.fromURL(CALENDAR_ICAL_URLS[idx]); } catch(e) { console.error("calendar feed "+(idx+1)+" failed:",e.message); continue; }
    for (const item of Object.values(data)) {
      if (!item || item.type!=="VEVENT") continue;
      const summary=clip(item.summary,250)||"Calendar event";
      const rule=classifyCalendar(summary);
      for (const start of eventOccurrences(item,now,lookahead)) {
        const trigger=dueTrigger((start-now)/60000,rule.targets); if (!trigger) continue;
        const uid=clip(item.uid||item.id||summary,180);
        const iso=start.toISOString();
        const key="calendar:"+uid+":"+iso+":"+trigger;
        const location=clip(item.location,300); const description=clip(item.description,900);
        const triggerText=trigger===1440?"about 24 hours":trigger===120?"about 2 hours":"about 30 minutes";
        try {
          await routeAlert({route:"family",severity:rule.severity,title:rule.level+" CALENDAR — "+summary,message:[location?"Location: "+location:"",description].filter(Boolean).join("\\n"),source:"Family Command / Calendar Bridge",eventTime:iso,action:"Starts in "+triggerText+". Review transportation, preparation, documents, ownership, and conflicts.",metadata:{Priority:rule.level,Trigger:String(trigger)+" min"},dedupeKey:key});
          sent++;
        } catch(e) { console.error("calendar alert failed:",e.message); }
      }
    }
  }
  console.log("calendar bridge complete: "+sent+" candidate alert(s) submitted");
}

async function getTodoistTasks() {
  if (!TODOIST_API_TOKEN) return []; let cursor=null; const all=[];
  for (let page=0; page<10; page++) {
    const url=new URL("https://api.todoist.com/api/v1/tasks"); url.searchParams.set("limit","200"); if(cursor) url.searchParams.set("cursor",cursor);
    const res=await fetch(url,{headers:{authorization:"Bearer "+TODOIST_API_TOKEN}}); if(!res.ok) throw new Error("todoist_"+res.status);
    const body=await res.json();
    if(Array.isArray(body)){ all.push(...body); break; }
    all.push(...(body.results||body.tasks||[])); cursor=body.next_cursor||body.nextCursor||null; if(!cursor) break;
  }
  return all;
}

async function pollTodoist() {
  if (!TODOIST_API_TOKEN) { console.log("todoist bridge: TODOIST_API_TOKEN not configured"); return; }
  const now=new Date(); const lp=localParts(now); const currentHour=Number(lp.hour); const currentMinute=Number(lp.minute);
  const today=localDateKey(now); const tomorrow=localDateKey(new Date(now.getTime()+86400000));
  let tasks=[]; try { tasks=await getTodoistTasks(); } catch(e) { console.error("todoist fetch failed:",e.message); return; }
  let sent=0;
  for (const task of tasks) {
    if (!task || task.checked || task.is_completed || task.is_deleted) continue;
    if (TODOIST_PROJECT_IDS.size && !TODOIST_PROJECT_IDS.has(String(task.project_id||""))) continue;
    const due=task.due; if(!due) continue;
    const content=clip(task.content,250)||"Todoist task"; const dueDate=due.datetime||due.date||"";
    let key=null, action=null, severity="warning", eventTime=dueDate;
    if(due.datetime){
      const d=new Date(due.datetime); const trigger=dueTrigger((d-now)/60000,[1440,120,30]);
      if(trigger){ key="todoist:"+task.id+":"+due.datetime+":"+trigger; action=trigger===1440?"Due in about 24 hours.":trigger===120?"Due in about 2 hours.":"Due in about 30 minutes."; }
    } else if(due.date && currentHour===8 && currentMinute<20){
      if(due.date===today){ key="todoist:"+task.id+":"+today+":today"; action="Due today. Confirm owner and next action."; }
      else if(due.date===tomorrow){ key="todoist:"+task.id+":"+tomorrow+":tomorrow"; action="Due tomorrow. Prepare today."; severity="notice"; }
      else if(due.date<today){ key="todoist:"+task.id+":"+today+":overdue"; action="Overdue. Reconcile, complete, delegate, or reschedule."; severity="critical"; }
    }
    if(!key) continue;
    try {
      await routeAlert({route:"task",severity,title:"TASK — "+content,message:clip(task.description,1000),source:"Family Command / Todoist Bridge",eventTime,action,metadata:{Project:String(task.project_id||""),Priority:String(task.priority||"")},dedupeKey:key}); sent++;
    } catch(e){ console.error("todoist alert failed:",e.message); }
  }
  console.log("todoist bridge complete: "+sent+" candidate alert(s) submitted");
}

async function main(){ console.log("huggins family bridge starting"); await pollCalendars(); await pollTodoist(); console.log("huggins family bridge finished"); }
main().catch(e=>{ console.error(e); process.exitCode=1; });
