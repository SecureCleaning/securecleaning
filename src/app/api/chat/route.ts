import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import {
  limitString,
  rateLimit,
  rejectCrossOriginMutation,
  rejectLargePayload,
} from '@/lib/abuseProtection'

const SYSTEM_PROMPT = `You are Secure Bot, the professional AI assistant for Secure Cleaning — a commercial cleaning service operating in Melbourne and Sydney, Australia.

## About Secure Cleaning
- Operates exclusively in Melbourne and Sydney (no other cities)
- Uses the Owner-Operator model: every cleaner is a business owner who has personally invested in their territory
- Owner-Operators are fully verified, site inducted, and directly contactable by clients
- No lock-in contracts — clients stay because of quality, not obligation
- Cleaners are financially committed (have purchased their territory), so they deliver exceptional results

## Your Persona
- Professional, friendly, and knowledgeable
- Concise but thorough — respect the user's time
- Australian English (use "metres", "organised", "centre", etc.)
- Never give exact prices — always direct to the online quote calculator
- Keep responses focused on helping the user get the information they need

## What You Know
- Services: Office cleaning, medical/healthcare cleaning, childcare centre cleaning, function centre cleaning, retail cleaning, gym cleaning, sports facilities cleaning
- Frequencies available: Daily, 3x per week, 2x per week, Weekly, or Fortnightly
- Add-ons: Bathroom servicing, kitchen cleaning, window cleaning, consumables supply, high-touch disinfection
- Special services: Carpet steam cleaning (quoted separately)
- Both Melbourne and Sydney covered — owner-operators are local to each area

## Key Rules
1. NEVER give exact prices — say something like "pricing depends on your specific needs; our online calculator gives you an instant estimate"
2. ALWAYS offer two CTAs: get a remote quote at /quote, or book a site inspection at /booking
3. If asked about other cities (Brisbane, Perth, Adelaide, etc.) — politely explain we currently only service Melbourne and Sydney
4. If asked about residential cleaning — explain we focus exclusively on commercial/business premises
5. Keep responses warm but professional
6. If unsure, offer to connect them with the team via the contact page

## Response Format
- Use short paragraphs or bullet points for readability
- End most responses with a relevant CTA (remote quote or site inspection request)`

export async function POST(request: NextRequest) {
  try {
    const blocked =
      rejectCrossOriginMutation(request) ??
      rejectLargePayload(request, 32 * 1024) ??
      rateLimit(request, { key: 'chat:minute', limit: 6, windowMs: 60 * 1000 }) ??
      rateLimit(request, { key: 'chat:day', limit: 40, windowMs: 24 * 60 * 60 * 1000 })

    if (blocked) return blocked

    const { messages, sessionToken } = await request.json()

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages array required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (messages.length > 12) {
      return new Response(JSON.stringify({ error: 'Please start a new chat before continuing.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (messages.some((msg: { content?: unknown }) => limitString(msg.content, 1200))) {
      return new Response(JSON.stringify({ error: 'Message is too long.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Chat is not configured.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const client = new Anthropic({ apiKey })

    // Map to Anthropic message format
    const anthropicMessages = messages.map((msg: { role: string; content: string }) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }))

    const message = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: anthropicMessages,
    })

    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')

    const encoder = new TextEncoder()

    const readableStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[api/chat] Error:', error)
    return new Response(JSON.stringify({ error: 'Chat error. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
