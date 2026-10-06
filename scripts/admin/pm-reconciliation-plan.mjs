// Pure dry-run planner. Applying a plan requires a separate reviewed transactional runner.
export const sameContext = (a,b) => a.AssetId===b.AssetId && a.FacilityId===b.FacilityId && a.TemplateId===b.TemplateId;
const date = x => new Date(x);
export const advance = (value,days,sign=1) => {
 const d=date(value), months={30:1,90:3,180:6,365:12}[days];
 if(!months)return new Date(+d+sign*days*86400000);
 const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+sign*months);
 const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d;
};
const untouched = t => t.Status==='open' && t.ApprovalStatus==='None' && !t.StartedAt && !t.TechnicianCompletedAt && !t.CompletedAt && !t.CancelledAt && !t.SourceTaskId && !t.ChecklistRows && !t.EvidenceRows && !t.SessionRows && !t.DraftRows;
export function buildPlan(snapshot) {
 const ts=snapshot.tasks, plans=[],exceptions=[],used=new Set();
 const add=(original,execution,planned,effective,kind)=>{
  if(used.has(original.TaskId)||used.has(execution.TaskId)){exceptions.push({task:execution.TaskNumber,reason:'multiple mappings'});return;}
  used.add(original.TaskId);used.add(execution.TaskId);
  const protectedContext=ts.some(t=>sameContext(t,execution)&&['in_progress','paused'].includes(t.Status));
  const setting=snapshot.settings.find(s=>s.ContextId===(execution.AssetId??execution.FacilityId)&&s.TemplateId===execution.TemplateId);
  plans.push({original,execution,plannedDueAt:planned,effectiveDueAt:effective,kind,setting:setting??null,repairAnchor:!protectedContext&&!!setting&&setting.LastPMCompletedAt===execution.CompletedAt,protectedContext});
 };
 for(const n of ts.filter(t=>t.TaskNumber.startsWith('PM-NOW-')&&t.Status==='completed'&&t.ApprovalStatus==='Approved'&&t.CompletedAt)){
  if(n.TechnicianCompletedAt!==n.CompletedAt){exceptions.push({task:n.TaskNumber,reason:'execution date conflict'});continue;}
  const all=ts.filter(t=>sameContext(t,n)&&!t.TaskNumber.startsWith('PM-NOW-')&&(!['completed','cancelled'].includes(t.Status)||['PendingSupervisor','PendingSuperadmin'].includes(t.ApprovalStatus))&&date(t.PlannedDueAt)>advance(n.ScheduledDueAt,n.IntervalDays,-1)&&date(t.PlannedDueAt)<=advance(n.ScheduledDueAt,n.IntervalDays));
  const overdue=all.filter(t=>date(t.ScheduledDueAt)<=date(n.ScheduledDueAt)).sort((a,b)=>date(b.PlannedDueAt)-date(a.PlannedDueAt));
  const future=all.filter(t=>date(t.ScheduledDueAt)>date(n.ScheduledDueAt)).sort((a,b)=>date(a.PlannedDueAt)-date(b.PlannedDueAt));
  const original=overdue[0]??future[0];
  if(!original){if(n.FulfilledPlannedDueAt!==n.PlannedDueAt)exceptions.push({task:n.TaskNumber,reason:'no unstarted normal occurrence within one cycle'});continue;}
  if(!untouched(original)){exceptions.push({task:n.TaskNumber,reason:'nearest occurrence has protected work; no substitution'});continue;}
  add(original,n,original.PlannedDueAt,original.ScheduledDueAt,'completed-now');
 }
 for(const n of ts.filter(t=>t.TaskNumber.startsWith('PM-NOW-')&&untouched(t))){
  const matches=ts.filter(t=>sameContext(t,n)&&!t.TaskNumber.startsWith('PM-NOW-')&&t.Status==='completed'&&t.ApprovalStatus==='Approved'&&date(t.CompletedAt)>=date(n.CreatedAt)&&date(t.PlannedDueAt)>=date(n.ScheduledDueAt)&&date(t.PlannedDueAt)<=advance(n.ScheduledDueAt,n.IntervalDays));
  if(matches.length===1)add(n,matches[0],matches[0].PlannedDueAt,matches[0].ScheduledDueAt,'unused-now');
  else exceptions.push({task:n.TaskNumber,reason:'unfinished work; no unique completed normal occurrence'});
 }
 for(const n of ts.filter(t=>t.TaskNumber.startsWith('PM-NOW-')&&['in_progress','paused'].includes(t.Status)))exceptions.push({task:n.TaskNumber,reason:'protected active work; kept unchanged'});
 return {scanned:ts.length,pmNow:ts.filter(t=>t.TaskNumber.startsWith('PM-NOW-')).length,plans,exceptions};
}
