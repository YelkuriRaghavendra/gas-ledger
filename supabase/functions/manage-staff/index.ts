import { createClient } from 'jsr:@supabase/supabase-js@2'
import { validateCreate, validateSetActive } from './validation.ts'
import { planSetActive } from './setActivePlan.ts'

// supabase.functions.invoke() sends Authorization + Content-Type, which makes
// this a non-simple cross-origin request -- the browser preflights it with
// OPTIONS before the real POST. Without these headers on every response
// (including error paths) the gateway never sees the actual request.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // The caller must be a signed-in app user. Without this check anyone who
  // discovers the URL could create themselves an owner login.
  const authHeader = req.headers.get('Authorization') ?? ''
  const anon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: userData, error: userError } = await anon.auth.getUser()
  if (userError || !userData?.user) return json({ error: 'unauthorized' }, 401)
  const callerId = userData.user.id

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // Owner-ness is read with the service-role key rather than trusted from the
  // JWT: role lives in profiles, not in the token, so a stale token from
  // before a demotion would otherwise still pass.
  const { data: caller, error: callerError } = await admin
    .from('profiles')
    .select('id, role, active')
    .eq('id', callerId)
    .single()
  if (callerError || !caller) return json({ error: 'forbidden', detail: 'Your profile is not set up.' }, 403)
  if (caller.role !== 'owner' || !caller.active) {
    return json({ error: 'forbidden', detail: 'Only an owner can manage staff.' }, 403)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_request', detail: 'Malformed request' }, 400)
  }

  const action = (body as { action?: unknown })?.action
  if (action === 'create') return handleCreate(admin, callerId, body)
  if (action === 'set_active') return handleSetActive(admin, callerId, body)
  return json({ error: 'invalid_request', detail: 'Unknown action' }, 400)

  // deno-lint-ignore no-explicit-any
  async function handleCreate(admin: any, callerId: string, body: unknown): Promise<Response> {
    const parsed = validateCreate(body)
    if (!parsed.ok) return json({ error: 'invalid_request', detail: parsed.detail }, 400)
    const input = parsed.value

    // email_confirm: true because no mail is being sent -- an unconfirmed user
    // cannot sign in, and the owner hands the password over in person.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.name },
    })

    if (createError || !created?.user) {
      const message = createError?.message ?? ''
      // GoTrue's own `code` is the reliable signal that the address itself is
      // the problem; the message regex is only a fallback for older/other
      // error shapes that don't carry a code. `status === 422` is NOT enough
      // on its own -- GoTrue also returns 422 for a weak password, a
      // signup_disabled project, or a malformed address, none of which is
      // "email taken", and telling the owner that would send them changing
      // the email forever against what is really a different problem.
      if (createError?.code === 'email_exists' || /already (been )?registered|already exists/i.test(message)) {
        return json({ error: 'email_taken' }, 409)
      }
      if (createError?.status === 422) {
        return json({ error: 'invalid_request', detail: message || 'The auth provider rejected this request' }, 400)
      }
      console.error('createUser failed:', message)
      return json({ error: 'server_error' }, 500)
    }

    const newId = created.user.id

    // db/schema.sql v4 has no handle_new_user trigger, so creating the auth
    // user leaves no profiles row behind and this insert is what creates it.
    // Written as an upsert because the live database may still carry the
    // legacy trigger from fresh_setup.sql, which would have inserted a
    // role='staff' row a moment ago. created_by / updated_by are passed
    // explicitly: stamp_audit reads auth.uid(), which is null under the
    // service-role key.
    const { error: profileError } = await admin
      .from('profiles')
      .upsert(
        {
          id: newId,
          name: input.name,
          role: input.role,
          segment_access: input.segment_access,
          active: true,
          created_by: callerId,
          updated_by: callerId,
        },
        { onConflict: 'id' },
      )

    if (profileError) {
      // Without this rollback a failed insert strands an auth user who can
      // sign in with no profile row, which ModeGate renders as a permanent
      // loading screen. The delete's own result is checked -- it can fail
      // too, and silently assuming it worked would log a "rolled back"
      // message for an account that is still there.
      const { error: deleteError } = await admin.auth.admin.deleteUser(newId)
      if (deleteError) {
        console.error(
          'profile upsert failed AND rollback delete failed -- an orphaned auth user was left behind:',
          profileError.message,
          deleteError.message,
        )
        return json({
          error: 'server_error',
          detail: 'The account could not be finished and the cleanup also failed. An account was left behind -- remove it in the Supabase dashboard.',
        }, 500)
      }
      console.error('profile upsert failed, rolled back auth user:', profileError.message)
      return json({ error: 'server_error', detail: 'The account could not be finished and was rolled back. Nothing was created.' }, 500)
    }

    return json({ ok: true, user_id: newId })
  }

  // deno-lint-ignore no-explicit-any
  async function handleSetActive(admin: any, callerId: string, body: unknown): Promise<Response> {
    const parsed = validateSetActive(body)
    if (!parsed.ok) return json({ error: 'invalid_request', detail: parsed.detail }, 400)
    const { user_id, active } = parsed.value

    if (user_id === callerId) {
      return json({ error: 'forbidden', detail: 'You cannot deactivate yourself.' }, 403)
    }

    const { data: target, error: targetError } = await admin
      .from('profiles')
      .select('id, role, active')
      .eq('id', user_id)
      .maybeSingle()
    if (targetError) {
      console.error('target lookup failed:', targetError.message)
      return json({ error: 'server_error' }, 500)
    }
    if (!target) return json({ error: 'not_found' }, 404)

    if (!active && target.role === 'owner') {
      const { count, error: countError } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'owner')
        .eq('active', true)
        .neq('id', user_id)
      if (countError) {
        console.error('owner count failed:', countError.message)
        return json({ error: 'server_error' }, 500)
      }
      if (!count) {
        return json({ error: 'forbidden', detail: 'At least one active owner is required.' }, 403)
      }
    }

    const plan = planSetActive(target, active)

    // The ban/unban call and the profiles.active write are two separate,
    // non-transactional calls to two different systems -- either can fail on
    // its own. See setActivePlan.ts for why the order is direction-dependent
    // and why the ban/unban call is never skipped, even when the flag
    // already reads the desired value (plan.write_flag === false): a prior
    // call may have written one side and not the other, and re-issuing the
    // same action is the only way to repair that. updateUserById is
    // idempotent on a repeated ban_duration, so re-applying it costs nothing
    // when nothing had actually drifted.

    if (plan.order === 'ban_then_flag') {
      const { error: banError } = await admin.auth.admin.updateUserById(user_id, {
        ban_duration: plan.ban_duration,
      })
      if (banError) {
        console.error('ban update failed:', banError.message)
        return json({ error: 'server_error' }, 500)
      }

      if (!plan.write_flag) return json({ ok: true })

      const { error: flagError } = await admin
        .from('profiles')
        .update({ active, updated_by: callerId })
        .eq('id', user_id)
      if (flagError) {
        // The account is now banned but the profiles row still reads active
        // -- e.g. a concurrent demotion tripped the database's last-active-
        // owner backstop even though the count check above passed. Lift the
        // ban we just applied rather than leave the account banned with no
        // way to undo it from inside the app.
        console.error('active flag update failed after ban, rolling back:', flagError.message)
        const { error: rollbackError } = await admin.auth.admin.updateUserById(user_id, { ban_duration: 'none' })
        if (rollbackError) {
          console.error(
            'rollback unban ALSO failed -- account is banned with no flag change, needs manual repair:',
            rollbackError.message,
          )
          return json({
            error: 'server_error',
            detail: 'The change failed and the rollback also failed. The account is now banned and needs to be unbanned manually in the Supabase dashboard.',
          }, 500)
        }
        return json({
          error: 'server_error',
          detail: 'The change could not be completed and was rolled back. Nothing changed.',
        }, 500)
      }

      return json({ ok: true })
    }

    // plan.order === 'flag_then_unban'
    if (plan.write_flag) {
      const { error: flagError } = await admin
        .from('profiles')
        .update({ active, updated_by: callerId })
        .eq('id', user_id)
      if (flagError) {
        // Nothing has reached GoTrue yet in this order -- the account is
        // untouched, so there is nothing to roll back.
        console.error('active flag update failed:', flagError.message)
        return json({ error: 'server_error' }, 500)
      }
    }

    const { error: unbanError } = await admin.auth.admin.updateUserById(user_id, {
      ban_duration: plan.ban_duration,
    })
    if (unbanError) {
      // The profile now reads active but the account is still banned --
      // visibly wrong but safe (nobody gains access who shouldn't), so this
      // is left for a retry rather than rolled back.
      console.error('unban failed after flag update:', unbanError.message)
      return json({ error: 'server_error' }, 500)
    }

    return json({ ok: true })
  }
})
