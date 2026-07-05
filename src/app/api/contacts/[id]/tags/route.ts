import { NextResponse, after } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { runAutomationsForTrigger } from '@/lib/automations/engine'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params
    const { accountId } = await getCurrentAccount()
    const body = await request.json()
    const { tag_id } = body

    if (!tag_id) {
      return NextResponse.json({ error: 'tag_id is required' }, { status: 400 })
    }

    const admin = supabaseAdmin()

    // 1. Verify contact exists and belongs to the account
    const { data: contact, error: contactErr } = await admin
      .from('contacts')
      .select('id')
      .eq('id', contactId)
      .eq('account_id', accountId)
      .maybeSingle()
    
    if (contactErr || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // 2. Verify tag exists and belongs to the account
    const { data: tag, error: tagErr } = await admin
      .from('tags')
      .select('id')
      .eq('id', tag_id)
      .eq('account_id', accountId)
      .maybeSingle()

    if (tagErr || !tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }

    // 3. Insert tag relationship
    const { error: insertErr } = await admin
      .from('contact_tags')
      .insert({ contact_id: contactId, tag_id: tag_id })

    // If it's a duplicate violation, Postgres returns 23505.
    // In that case, we don't trigger the automation again.
    if (insertErr) {
      if (insertErr.code === '23505') {
        // Already exists
        return NextResponse.json({ ok: true, already_exists: true })
      }
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    // 4. Trigger tag_added automation
    // We run this inside Next.js after() to guarantee execution completion 
    // without blocking the 200 OK response or getting killed by Vercel.
    after(async () => {
      try {
        await runAutomationsForTrigger({
          accountId,
          triggerType: 'tag_added',
          contactId: contactId,
          context: {
            tag_id: tag_id,
          },
        })
      } catch (err) {
        console.error('[automations] tag_added dispatch failed:', err)
      }
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params
    const { accountId } = await getCurrentAccount()
    const url = new URL(request.url)
    const tag_id = url.searchParams.get('tag_id')

    if (!tag_id) {
      return NextResponse.json({ error: 'tag_id is required' }, { status: 400 })
    }

    const admin = supabaseAdmin()

    // 1. Verify contact exists and belongs to the account
    const { data: contact, error: contactErr } = await admin
      .from('contacts')
      .select('id')
      .eq('id', contactId)
      .eq('account_id', accountId)
      .maybeSingle()
    
    if (contactErr || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // 2. Delete tag relationship
    const { error: deleteErr } = await admin
      .from('contact_tags')
      .delete()
      .eq('contact_id', contactId)
      .eq('tag_id', tag_id)

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
