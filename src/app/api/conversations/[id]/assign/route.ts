import { NextResponse, after } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { runAutomationsForTrigger } from '@/lib/automations/engine'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params
    const { accountId } = await getCurrentAccount()
    const body = await request.json()
    const assigned_agent_id = body.assigned_agent_id ?? null

    const admin = supabaseAdmin()

    // 1. Verify conversation exists and belongs to the account
    const { data: conversation, error: convErr } = await admin
      .from('conversations')
      .select('id, contact_id, assigned_agent_id')
      .eq('id', conversationId)
      .eq('account_id', accountId)
      .maybeSingle()
    
    if (convErr || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // 2. No-op check
    if (conversation.assigned_agent_id === assigned_agent_id) {
      return NextResponse.json({ ok: true, no_op: true })
    }

    // 3. Verify the requested assignee belongs to the account (if not null)
    if (assigned_agent_id) {
      const { data: agent, error: agentErr } = await admin
        .from('profiles')
        .select('user_id')
        .eq('user_id', assigned_agent_id)
        .eq('account_id', accountId)
        .maybeSingle()

      if (agentErr || !agent) {
        return NextResponse.json(
          { error: 'Agent not found or does not belong to this account' }, 
          { status: 403 }
        )
      }
    }

    // 4. Perform the assignment update
    const { error: updateErr } = await admin
      .from('conversations')
      .update({ assigned_agent_id })
      .eq('id', conversationId)
      .eq('account_id', accountId)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // 5. Trigger conversation_assigned automation
    // We run this inside Next.js after() to guarantee execution completion 
    // without blocking the 200 OK response or getting killed by Vercel.
    after(async () => {
      try {
        await runAutomationsForTrigger({
          accountId,
          triggerType: 'conversation_assigned',
          contactId: conversation.contact_id,
          context: {
            agent_id: assigned_agent_id ?? undefined,
          },
        })
      } catch (err) {
        console.error('[automations] conversation_assigned dispatch failed:', err)
      }
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
