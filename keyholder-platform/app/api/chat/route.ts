import { streamText, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { createServerSupabase } from '@/lib/supabase/control-plane'
import { buildSystemPrompt } from '@/lib/claude/system-prompt'
import { buildTools } from '@/lib/claude/tools'
import { calculateCreditsUsed } from '@/lib/claude/credit-calculator'
import { decrypt } from '@/lib/crypto'

export async function POST(req: Request) {
  const { messages, tenantId } = await req.json()

  const supabase = createServerSupabase()

  // Get tenant project info
  const { data: project } = await supabase
    .from('customer_projects')
    .select('*')
    .eq('customer_id', tenantId)
    .single()

  if (!project) {
    return new Response(JSON.stringify({ error: 'No project found' }), {
      status: 404,
    })
  }

  // Check credits
  const { data: credits } = await supabase
    .from('credit_balances')
    .select('credits_remaining')
    .eq('customer_id', tenantId)
    .single()

  if (!credits || credits.credits_remaining <= 0) {
    return new Response(
      JSON.stringify({ error: 'No credits remaining. Please upgrade your plan.' }),
      { status: 402 }
    )
  }

  // Save user message
  const lastMessage = messages[messages.length - 1]
  if (lastMessage?.role === 'user') {
    const userContent = typeof lastMessage.content === 'string'
      ? lastMessage.content
      : lastMessage.parts?.find((p: { type: string }) => p.type === 'text')?.text || ''
    await supabase.from('chat_messages').insert({
      customer_id: tenantId,
      role: 'user',
      content: userContent,
    })
  }

  // Build system prompt and tools
  const serviceKey = decrypt(project.supabase_service_key_encrypted)

  const systemPrompt = await buildSystemPrompt(
    project.supabase_url,
    serviceKey
  )

  const tools = buildTools(
    project.supabase_url,
    serviceKey
  )

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: systemPrompt,
    messages,
    tools,
    stopWhen: stepCountIs(10),
    onFinish: async ({ text, steps, totalUsage }) => {
      // Deduct credits based on actual token usage
      const creditsUsed = calculateCreditsUsed(
        totalUsage.inputTokens ?? 0,
        totalUsage.outputTokens ?? 0
      )

      try {
        await supabase.rpc('deduct_credits', {
          p_customer_id: tenantId,
          p_amount: Math.ceil(creditsUsed),
          p_reason: 'chat_turn',
          p_tokens_in: totalUsage.inputTokens ?? 0,
          p_tokens_out: totalUsage.outputTokens ?? 0,
        })
      } catch {
        // Log but don't fail the response
        console.error('Failed to deduct credits')
      }

      // Save assistant message
      try {
        const toolCalls = steps.flatMap((s) => s.toolCalls)
        await supabase.from('chat_messages').insert({
          customer_id: tenantId,
          role: 'assistant',
          content: text || '',
          tool_calls: toolCalls.length > 0 ? toolCalls : null,
          tokens_in: totalUsage.inputTokens ?? 0,
          tokens_out: totalUsage.outputTokens ?? 0,
          credits_used: Math.ceil(creditsUsed),
        })
      } catch {
        console.error('Failed to save assistant message')
      }
    },
  })

  return result.toUIMessageStreamResponse()
}
