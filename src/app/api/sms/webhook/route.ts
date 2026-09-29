import { NextRequest, NextResponse } from 'next/server'
import { verifySmsWebhook } from '@/lib/mobileMessage'
import { processSmsEvent, SmsEventError } from '@/lib/smsEvents'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function POST(request:NextRequest) {
  if(process.env.VERCEL_ENV!=='production') return NextResponse.json({error:'Unavailable'},{status:404})
  if(Number(request.headers.get('content-length'))>16000) return NextResponse.json({error:'Too large'},{status:413})
  const raw=await request.text()
  if(Buffer.byteLength(raw)>16000) return NextResponse.json({error:'Too large'},{status:413})
  if(!verifySmsWebhook(raw,request.headers.get('x-mm-timestamp'),request.headers.get('x-mm-signature'))) return NextResponse.json({error:'Invalid signature'},{status:401})
  try {
    const body=JSON.parse(raw)
    if(!body||typeof body!=='object'||Array.isArray(body)) throw new SmsEventError('Invalid event')
    await processSmsEvent(body)
    return NextResponse.json({ok:true})
  } catch(error) {return NextResponse.json({error:'Event could not be processed'},{status:error instanceof SmsEventError||error instanceof SyntaxError?400:503})}
}
