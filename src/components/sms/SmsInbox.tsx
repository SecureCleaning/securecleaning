'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { smsApi } from './SmsControls'
type Reply={id:string;mobile:string;message:string;quoteRef:string|null;href:string|null;received_at:string;opted_out:boolean}
export default function SmsInbox() {
  const [replies,setReplies]=useState<Reply[]>([]),[owner,setOwner]=useState(false),[error,setError]=useState('')
  const load=useCallback(async()=>{try{const r=await fetch('/api/staff/sms?view=inbox',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error);setReplies(d.replies);setOwner(d.owner);setError('')}catch(e){setError(e instanceof Error?e.message:'SMS replies unavailable.')}},[])
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),60000);return()=>clearInterval(timer)},[load])
  async function read(id:string){try{await smsApi({action:'read',id});await load()}catch(e){setError(e instanceof Error?e.message:'Unable to update reply.')}}
  return <details className="my-4 rounded-2xl border bg-white p-4"><summary className="cursor-pointer font-semibold">SMS replies ({replies.length})</summary><div className="mt-3 space-y-3">{owner&&<Link className="text-sm text-teal-700 underline" href="/admin/sms">SMS settings and delivery issues</Link>}{error&&<p role="status" className="text-sm text-amber-900">{error}</p>}{replies.map(r=><article key={r.id} className="rounded-lg border p-3 text-sm"><p className="font-semibold">+{r.mobile} - {r.quoteRef||'Unmatched reply - owner review'}</p><p className="whitespace-pre-wrap">{r.message}</p><p className="text-xs text-gray-500">{new Date(r.received_at).toLocaleString('en-AU')}{r.opted_out?' - Opted out':''}</p><div className="mt-2 flex gap-4">{r.href&&<Link href={r.href} className="text-teal-700 underline">Open quote</Link>}<button className="underline" onClick={()=>read(r.id)}>Mark reviewed</button></div></article>)}{!error&&!replies.length&&<p className="text-sm text-gray-500">No unread SMS replies.</p>}</div></details>
}
