'use client'
import { useState } from 'react'
import { DEFAULT_SMS_TEMPLATE, smsSegments } from '@/lib/smsPolicy'
export async function smsApi(body:Record<string,unknown>) {
  const response=await fetch('/api/staff/sms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  const data=await response.json()
  if(!response.ok) throw new Error(data.error||'SMS action failed.')
  return data
}
type Preview={id:string;ref:string|null;mobile:string;message:string;zone:string;test:boolean;expires:number;fingerprint:string;segments:number;encoding:string;estimatedCents:number;dueAt:string}
export function SmsComposer({quoteRef,test=false,onSent,initialTemplate=DEFAULT_SMS_TEMPLATE}:{quoteRef?:string;test?:boolean;onSent?:()=>void;initialTemplate?:string}) {
  const [message,setMessage]=useState(initialTemplate),[mobile,setMobile]=useState(''),[city,setCity]=useState('sydney'),[preview,setPreview]=useState<Preview|null>(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
  const segments=smsSegments(message)
  const change=()=>{setPreview(null);setConfirmed(false);setNotice('')}
  async function act(send:boolean) {
    setBusy(true);setNotice('')
    try {
      if(send&&preview) {
        const result=await smsApi({action:'send',quoteRef,test,mobile,city,message:preview.message,requestId:preview.id,expires:preview.expires,fingerprint:preview.fingerprint,confirmed})
        setNotice(`SMS queued for ${new Date(result.dueAt).toLocaleString('en-AU',{timeZone:preview.zone})} (${preview.zone}).`);setPreview(null);setConfirmed(false);onSent?.()
      } else {
        setPreview(await smsApi({action:'preview',quoteRef,test,mobile,city,message}));setConfirmed(false)
      }
    } catch(error) {setNotice(error instanceof Error?error.message:'Unable to prepare SMS.')}
    finally {setBusy(false)}
  }
  return <div className="space-y-3">
    {test&&<div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Test recipient<input aria-label="Test recipient" className="mt-1 block w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm" value={mobile} onChange={e=>{setMobile(e.target.value);change()}} placeholder="04xx xxx xxx" /></label><label className="text-sm">Recipient region<select className="mt-1 block w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm" value={city} onChange={e=>{setCity(e.target.value);change()}}><option value="sydney">Sydney</option><option value="melbourne">Melbourne</option></select></label></div>}
    <label className="block text-sm">Message<textarea className="mt-1 block w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm mt-1 min-h-24" value={message} onChange={e=>{setMessage(e.target.value);change()}} maxLength={1500} /></label>
    <p className="text-xs text-gray-600">{segments.segments} segment(s) - {segments.encoding}. Fields: {'{{first_name}}, {{client_name}}, {{quote_reference}}'}. All sends use 9am-6pm Monday-Friday, local time.</p>
    <button className="rounded-lg border px-3 py-2 text-sm font-semibold" disabled={busy} onClick={()=>act(false)}>Preview SMS</button>
    {preview&&<div className="space-y-3 rounded-xl border border-teal-300 bg-teal-50 p-4"><p className="font-semibold">To +{preview.mobile}</p><p className="whitespace-pre-wrap">{preview.message}</p><p className="text-sm">{preview.segments} segment(s) - estimated ${(preview.estimatedCents/100).toFixed(2)} ex GST. Scheduled: {new Date(preview.dueAt).toLocaleString('en-AU',{timeZone:preview.zone})} ({preview.zone}).</p><label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />I confirm this recipient and message{test?' is an authorised test':''}.</label><button disabled={!confirmed||busy} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-40" onClick={()=>act(true)}>Confirm and queue SMS</button></div>}
    {notice&&<p role="status" className="text-sm text-amber-900">{notice}</p>}
  </div>
}
