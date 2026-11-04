'use client'
import { useCallback, useEffect, useState } from 'react'
import ActionToast from '@/components/ActionToast'
import type { BookingInputs } from '@/lib/types'

type RequestRow = {contact_review_required?:boolean;id:string;assigned_assignee_id:string;proposed_times:{date:string;startTime:string}[];decision_status:string;selected_proposal:number|null;decision_reason:string|null;decided_at:string|null;email_status:string;calendar_status:string;decision_email_status:string;decision_calendar_status:string;booking:{booking_ref:string;inputs:BookingInputs;opportunity_id:string|null}|null}
const button='rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50'
function needsCheck(row:RequestRow) {return [row.email_status,row.calendar_status,row.decision_email_status,row.decision_calendar_status].some(s=>['review_required','sending','queued'].includes(s))}
export default function PartnerAppointmentReview({assigneeId}:{assigneeId?:string}) {
  const endpoint=assigneeId?`/api/availability-agent/${encodeURIComponent(assigneeId)}/partner-requests`:'/api/admin/partner-requests'
  const [rows,setRows]=useState<RequestRow[]>([]),[loading,setLoading]=useState(true),[more,setMore]=useState(false),[history,setHistory]=useState(false)
  const [message,setMessage]=useState(''),[error,setError]=useState(false),[busy,setBusy]=useState('')
  const [draft,setDraft]=useState<Record<string,{selected:number;reason:string;reviewed:boolean}>>({})
  const load=useCallback(async()=>{const res=await fetch(endpoint,{cache:'no-store'});const data=await res.json();if(!res.ok)throw new Error(data.error || 'Unable to load appointment requests.');setRows(data.requests);setMore(data.morePending)},[endpoint])
  useEffect(()=>{let alive=true;load().catch(e=>{if(alive){setError(true);setMessage(e.message)}}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[load])
  async function decide(row:RequestRow,decision:'confirmed'|'declined') {
    const value=draft[row.id] || {selected:-1,reason:'',reviewed:false}
    setBusy(row.id);setMessage('')
    try {
      const res=await fetch(endpoint,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row.id,decision,...value})}),data=await res.json()
      if(!res.ok)throw new Error(data.error || 'Unable to review request.')
      const warning=data.emailStatus!=='sent' || !['sent','internal','not_required'].includes(data.calendarStatus)
      setError(warning);setMessage(warning?'Decision saved. Delivery or calendar status needs a team check; do not confirm again.':decision==='confirmed'?'Appointment confirmed. Customer and agent notifications sent.':'Request declined. The customer has been told the appointment is still TBA.')
      await load()
    }catch(e){setError(true);setMessage((e as Error).message)}finally{setBusy('')}
  }
  const pending=rows.filter(r=>r.decision_status==='pending'),attention=rows.filter(needsCheck),contactChecks=rows.filter(r=>r.contact_review_required)
  return <section id="appointment-requests" className="my-6 scroll-mt-28 space-y-4 rounded-2xl border bg-white p-5">
    <ActionToast message={message} tone={error?'error':'success'} onDismiss={()=>setMessage('')} />
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Appointment requests ({pending.length}{more?'+':''})</h2><p className="text-sm text-gray-600">Proposed times outside published availability. Review here to confirm with the customer.</p></div><button className={button} disabled={Boolean(busy)} onClick={()=>void load().catch(e=>{setError(true);setMessage(e.message)})}>Refresh requests</button></div>
    {attention.length>0&&<p role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-900">{attention.length} request(s) have notifications processing or needing a delivery check. Review the email provider and connected calendar before retrying any delivery.</p>}
    {contactChecks.length>0&&<p role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-900">{contactChecks.length} request(s) need an administrator to review the client details before linking them to Client CRM.</p>}
    {loading?<p>Loading requests...</p>:!pending.length&&<p>No appointment requests awaiting approval.</p>}
    {more&&<p>Showing the first 100 requests awaiting appointment or client review.</p>}
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={history} onChange={e=>setHistory(e.target.checked)} />Show recent decisions and delivery status</label>
    {rows.filter(r=>history||r.decision_status==='pending'||needsCheck(r)||r.contact_review_required).map(row=>{
      const input=row.booking?.inputs,value=draft[row.id]||{selected:-1,reason:'',reviewed:false}
      const update=(change:Partial<typeof value>)=>setDraft(d=>({...d,[row.id]:{...value,...change}}))
      const waiting=['queued','sending'].includes(row.email_status),disabled=Boolean(busy)||waiting
      return <article key={row.id} className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap justify-between gap-2"><div><strong>{input?.businessName || 'Booking unavailable'}</strong><p className="text-sm">{row.booking?.booking_ref} · {input?.preferredInspectionAssigneeName} · {row.decision_status==='pending'?'TBA - awaiting approval':row.decision_status}</p></div>{row.booking?.opportunity_id&&<a className="text-sm font-semibold text-teal-700 underline" href={`${assigneeId?`/availability/clients/${encodeURIComponent(assigneeId)}`:'/admin/clients'}?opportunity=${encodeURIComponent(row.booking.opportunity_id)}`}>Open client record</a>}</div>
        {row.contact_review_required&&<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><strong>Client details need review.</strong> The submitted details are saved below. An administrator must check them before linking this request to Client CRM. Existing client records have not been changed. You can still review the proposed appointment times.</p>}
        {input&&<><p className="text-sm">{input.contactName} · {input.email} · {input.phone}<br />{input.address}, {input.suburb} {input.postcode}<br />Premises: {input.premisesType} · Cleaning: {input.frequency} · {input.timePreference}</p><p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm"><strong>Internal notes:</strong> {input.notes || 'None'}</p></>}
        <fieldset disabled={disabled||row.decision_status!=='pending'} className="space-y-2"><legend className="font-semibold">Proposed times ({input?.city==='brisbane'?'Queensland':'local state'} time)</legend>{row.proposed_times.map((p,i)=><label key={`${p.date}-${p.startTime}`} className="flex gap-2"><input type="radio" name={`proposal-${row.id}`} checked={row.decision_status==='pending'?value.selected===i:row.selected_proposal===i} onChange={()=>update({selected:i,reviewed:false})} />{new Date(`${p.date}T12:00:00Z`).toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})} at {p.startTime} (10 minutes)</label>)}</fieldset>
        {row.decision_status==='pending'?<><p className="text-sm text-gray-600">Approval overrides published appointment windows. Existing appointments and travel allowance are checked before confirmation.</p><label className="block text-sm">Internal reason (required when declining)<textarea className="mt-1 w-full rounded-lg border p-2" maxLength={1000} disabled={disabled} value={value.reason} onChange={e=>update({reason:e.target.value})} /></label><label className="flex gap-2 text-sm"><input type="checkbox" disabled={disabled} checked={value.reviewed} onChange={e=>update({reviewed:e.target.checked})} />I have reviewed the details. My decision will notify the customer and agent.</label><div className="flex flex-wrap gap-2"><button className={`${button} bg-teal-700 text-white`} disabled={disabled||!value.reviewed||value.selected<0} onClick={()=>void decide(row,'confirmed')}>{busy===row.id?'Saving...':'Confirm selected time & notify'}</button><button className={button} disabled={disabled||!value.reviewed||!value.reason.trim()} onClick={()=>void decide(row,'declined')}>Decline proposed times & notify</button></div>{waiting&&<p className="text-sm">Initial notification is processing. Refresh shortly.</p>}</>:<p className="text-sm">Reviewed {row.decided_at?new Date(row.decided_at).toLocaleString('en-AU'):''}{row.decision_reason?` · ${row.decision_reason}`:''}</p>}
        {needsCheck(row)&&<p className="text-sm text-amber-900">Initial notifications: {row.email_status}. Decision notifications: {row.decision_email_status}. Connected calendar: {row.decision_calendar_status}.</p>}
      </article>
    })}
  </section>
}
