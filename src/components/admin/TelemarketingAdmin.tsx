'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import ActionToast from '@/components/ActionToast'
import type { City } from '@/lib/types'
type Company = { id: string; name: string; active: boolean; cities: City[]; assignee_ids: string[]; expires_at: string | null }
type User = { id: string; company_id: string; username: string; display_name: string; active: boolean }
type Activity = { id: string; user_id: string; company_id: string; created_at: string; email_status: string; calendar_status: string; bookings: { booking_ref: string; inputs: { businessName: string; preferredInspectionAssigneeName: string }; opportunity_id: string | null } | null }
type Data = { companies: Company[]; users: User[]; activity: Activity[]; calendars: { id: string; name: string; city: City; active: boolean }[] }
const newCompany = (): Company => ({ id: '', name: '', active: false, cities: [], assignee_ids: [], expires_at: null })
const newUser = () => ({ id: '', company_id: '', username: '', display_name: '', active: true, password: '' })
const regions: Record<City,string> = { melbourne: 'VIC', sydney: 'NSW', brisbane: 'QLD' }
const field = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2'
const button = 'rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50'
export default function TelemarketingAdmin() {
  const [data,setData] = useState<Data | null>(null), [company,setCompany] = useState(newCompany), [user,setUser] = useState(newUser)
  const [busy,setBusy] = useState(false), [notice,setNotice] = useState({ text: '', error: false })
  async function load() { const res = await fetch('/api/admin/telemarketing', { cache: 'no-store' }); const body = await res.json(); if (!res.ok) throw new Error(body.error); setData(body) }
  useEffect(() => { void load().catch(e => setNotice({ text: e.message, error: true })) }, [])
  async function save(body: unknown) { setBusy(true); setNotice({ text:'', error:false }); try { const res = await fetch('/api/admin/telemarketing', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body) }); const result = await res.json(); if (!res.ok) throw new Error(result.error); await load(); setNotice({text:'Access settings saved.',error:false}); return true } catch(e) { setNotice({text:(e as Error).message,error:true});return false } finally {setBusy(false)} }
  function toggle<T>(items:T[],item:T) {return items.includes(item)?items.filter(v=>v!==item):[...items,item]}
  return <div className="space-y-6">
    <ActionToast message={notice.text} tone={notice.error?'error':'success'} onDismiss={()=>setNotice({text:'',error:false})}/>
    <div><h1 className="text-3xl font-bold">Telemarketing access</h1><p className="mt-2 text-gray-600">Create restricted company access and individual caller logins. Existing bookings and client assignments are not changed.</p><Link className="mt-3 inline-block font-semibold text-teal-700 underline" href="/partner-booking" target="_blank">Open partner booking login</Link></div>
    {!data?<p>Loading access settings...</p>:<>
    <section className="space-y-4 rounded-xl border bg-white p-6"><div className="flex justify-between"><h2 className="text-xl font-bold">Companies and calendar permissions</h2><button className="rounded-lg border px-3 py-2" disabled={busy} onClick={()=>setCompany(newCompany())}>New company</button></div>
      <div className="flex flex-wrap gap-2">{data.companies.map(c=><button disabled={busy} className={`rounded-lg border px-3 py-2 ${company.id===c.id?'bg-teal-50 border-teal-500':''}`} key={c.id} onClick={()=>setCompany(c)}>{c.name} · {c.active?'Enabled':'Disabled'}</button>)}</div>
      <form className="space-y-4" onSubmit={async e=>{e.preventDefault();if(await save({...company,kind:'company'}))setCompany(newCompany())}}>
      <label className="block">Company name<input required maxLength={120} className={field} value={company.name} onChange={e=>setCompany({...company,name:e.target.value})}/></label>
      <label className="flex gap-2"><input type="checkbox" checked={company.active} onChange={e=>setCompany({...company,active:e.target.checked})}/>Enable company access</label>
      <fieldset><legend className="font-semibold">Allowed states</legend><div className="mt-2 flex gap-5">{(Object.keys(regions) as City[]).map(c=><label key={c} className="flex gap-2"><input type="checkbox" checked={company.cities.includes(c)} onChange={()=>setCompany({...company,cities:toggle(company.cities,c)})}/>{regions[c]}</label>)}</div></fieldset>
      <fieldset><legend className="font-semibold">Allowed calendars</legend><p className="text-sm text-gray-600">A calendar is bookable only when its state is also enabled and its agent has matching suburb availability. Existing priority still applies.</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{data.calendars.map(a=><label key={a.id} className="flex items-start gap-2 rounded-lg border p-3"><input type="checkbox" checked={company.assignee_ids.includes(a.id)} onChange={()=>setCompany({...company,assignee_ids:toggle(company.assignee_ids,a.id)})}/><span>{a.name} ({regions[a.city]}){!a.active?' — inactive':''}{!company.cities.includes(a.city)?' — state excluded':''}</span></label>)}</div></fieldset>
      <label className="block max-w-sm">Access expires (optional, your local time)<input type="datetime-local" className={field} value={company.expires_at?new Date(Date.parse(company.expires_at)-new Date(company.expires_at).getTimezoneOffset()*60000).toISOString().slice(0,16):''} onChange={e=>setCompany({...company,expires_at:e.target.value?new Date(e.target.value).toISOString():null})}/></label>
      <button disabled={busy} className={button}>Save company permissions</button></form>
    </section>
    <section className="space-y-4 rounded-xl border bg-white p-6"><div className="flex justify-between"><h2 className="text-xl font-bold">Individual caller accounts</h2><button className="rounded-lg border px-3 py-2" disabled={busy} onClick={()=>setUser(newUser())}>New caller</button></div>
    <div className="flex flex-wrap gap-2">{data.users.map(u=><button key={u.id} disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>setUser({...u,password:''})}>{u.display_name} ({u.username}) · {u.active?'Enabled':'Disabled'}</button>)}</div>
    <form className="space-y-4" onSubmit={async e=>{e.preventDefault();if(await save({...user,kind:'user'}))setUser(newUser())}}><div className="grid gap-4 sm:grid-cols-2">
    <label>Company<select required className={field} value={user.company_id} onChange={e=>setUser({...user,company_id:e.target.value})}><option value="">Choose company</option>{data.companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Caller name<input required maxLength={120} className={field} value={user.display_name} onChange={e=>setUser({...user,display_name:e.target.value})}/></label>
    <label>Username<input required pattern="[a-z0-9._-]+" maxLength={80} autoComplete="off" className={field} value={user.username} onChange={e=>setUser({...user,username:e.target.value})}/></label>
    <label>{user.id?'New password (leave blank to keep)':'Initial password'}<input type="password" autoComplete="new-password" required={!user.id} minLength={12} maxLength={256} className={field} value={user.password} onChange={e=>setUser({...user,password:e.target.value})}/></label></div>
    <label className="flex gap-2"><input type="checkbox" checked={user.active} onChange={e=>setUser({...user,active:e.target.checked})}/>Enable caller</label><p className="text-sm text-gray-600">Saving an account ends its existing sessions. Share the login details directly with the caller; no email is sent here.</p><button disabled={busy} className={button}>Save caller account</button></form></section>
    <section className="space-y-4 rounded-xl border bg-white p-6"><div className="flex justify-between"><h2 className="text-xl font-bold">Recent partner bookings and delivery checks</h2><button className="rounded-lg border px-3 py-2" disabled={busy} onClick={()=>void load().catch(e=>setNotice({text:e.message,error:true}))}>Refresh</button></div><p className="text-sm text-gray-600">Latest 100 bookings. Queued, sending or review-required outcomes need a team check before any resend.</p>{!data.activity.length&&<p>No partner bookings yet.</p>}
    {data.activity.map(a=><article key={a.id} className="space-y-1 rounded-lg border p-4"><p className="font-bold">{a.bookings?.booking_ref||'Booking removed'} · {a.bookings?.inputs.businessName}</p><p>{data.companies.find(c=>c.id===a.company_id)?.name} · {data.users.find(u=>u.id===a.user_id)?.display_name} · {new Date(a.created_at).toLocaleString('en-AU')}</p><p>Agent: {a.bookings?.inputs.preferredInspectionAssigneeName||'Check booking'}</p><p className={a.email_status!=='sent'||!['sent','internal'].includes(a.calendar_status)?'font-semibold text-amber-800':''}>Confirmations: {a.email_status.replaceAll('_',' ')} · Calendar: {a.calendar_status==='internal'?'Secure Cleaning calendar':a.calendar_status.replaceAll('_',' ')}</p>{a.bookings?.opportunity_id&&<Link className="inline-block text-teal-700 underline" href={`/admin/clients?opportunity=${encodeURIComponent(a.bookings.opportunity_id)}`}>Open client record</Link>}</article>)}
    </section></>}
  </div>
}
