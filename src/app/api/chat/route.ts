import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are Max, the professional AI assistant for Secure Cleaning Aus — a commercial cleaning service operating in Melbourne and Sydney, Australia.

## About Secure Cleaning Aus
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
- Services: Office cleaning, medical/healthcare cleaning, industrial cleaning, childcare centre cleaning, retail cleaning, gym cleaning, warehouse cleaning
- Frequencies available: Daily, 3x per week, 2x per week, Weekly, Fortnightly, Once-off
- Add-ons: Bathroom servicing, kitchen cleaning, window cleaning, consumables supply, high-touch disinfection
- Special services: Spring cleans, carpet steam cleaning (quoted separately)
- Both Melbourne and Sydney covered — owner-operators are local to each area

## Key Rules
1. NEVER give exact prices — say something like "pricing depends on your specific needs; our online calculator gives you an instant estimate"
2. ALWAYS offer two CTAs: get a quote at /quote, or book directly at /booking
3. If asked about other cities (Brisbane, Perth, Adelaide, etc.) — politely explain we currently only service Melbourne and Sydney
4. If asked about residential cleaning — explain we focus exclusively on commercial/business premises
5. Keep responses warm but professional
6. If unsure, offer to connect them with the team via the contact page

## Response Format
- Use short paragraphs or bullet points for readability
- End most responses with a relevant CTA (quote or booking)`

export async function POST(request: NextRequest) {
  try {
    const { messages, sessionToken } = await request.json()

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages array required' }), {
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

    // Create a streaming response
    const stream = await client.messages.stream({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: anthropicMessages,
    })

    // Return a streaming text response
    const encoder = new TextEncoder()

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              const text = chunk.delta.text
              // Server-sent event format
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
              )
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          controller.error(err)
        }
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
