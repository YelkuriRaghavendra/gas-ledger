import { createClient } from 'jsr:@supabase/supabase-js@2'
import { validateCreate, validateSetActive } from './validation.ts'
import { banDurationToRestore, isLastOwnerBackstop, planSetActive } from './setActivePlan.ts'

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
      // Both codes mean the same thing: current GoTrue returns `email_exists`,
      // older admin-create responses returned `user_already_exists`.
      if (
        createError?.code === 'email_exists' ||
        createError?.code === 'user_already_exists' ||
        /already (been )?registered|already exists/i.test(message)
      ) {
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
          detail: 'The account could not be finished and a half-made login was left behind. Get help before trying this email again.',
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
      // Read the ban state before changing it. The compensation below has to
      // put back whatever was there, and this is the only record of it: an
      // account that was already banned while the flag still read active --
      // exactly the half-written state a re-issued deactivate exists to
      // repair -- would otherwise be handed an unban it never had.
      // If this read fails we do not know what to restore, so the ban is not
      // applied at all: refusing the request changes nothing, which is the
      // safe side.
      const { data: before, error: readError } = await admin.auth.admin.getUserById(user_id)
      if (readError || !before?.user) {
        console.error('could not read the current ban state, not banning:', readError?.message ?? 'no user returned')
        return json({ error: 'server_error' }, 500)
      }
      const priorBan = before.user.banned_until

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
        // Only one failure is worth undoing the ban for: the database's
        // last-active-owner backstop (the handler's own count check above can
        // be raced by a concurrent demotion). That one would leave the last
        // owner banned with nobody able to let them back in. Every other
        // failure -- a staff target, a transient PostgREST error -- is left
        // banned on purpose: the owner asked for this account to be shut off,
        // and restoring access on a database hiccup would undo exactly that.
        if (!isLastOwnerBackstop(flagError.message)) {
          console.error('active flag update failed after ban, leaving the ban in place:', flagError.message)
          return json({
            error: 'server_error',
            // PostgREST can report an error for a write that committed, so
            // the flag's state is genuinely unknown here -- do not claim it
            // is unchanged.
            detail: 'Their access was switched off, but the staff list may not have been updated. Refresh to check.',
          }, 500)
        }

        console.error('last-active-owner backstop rejected the flag write, restoring the prior ban state:', flagError.message)
        const { error: restoreError } = await admin.auth.admin.updateUserById(user_id, {
          ban_duration: banDurationToRestore(priorBan, Date.now()),
        })
        if (restoreError) {
          // Nothing in the app can reach this account now; it takes a human
          // with dashboard access to lift the ban.
          console.error(
            'restoring the prior ban state ALSO failed -- the account is banned with no flag change and needs the ban lifted by hand in the Supabase dashboard:',
            restoreError.message,
          )
          return json({
            error: 'server_error',
            detail: 'The change failed and this account has been left blocked. It cannot be unblocked from here, so get help before signing out.',
          }, 500)
        }
        // The backstop raises an exception, so the flag write definitely did
        // not commit and the ban is back as it was -- the same 403 the
        // handler's own count check returns.
        return json({ error: 'forbidden', detail: 'At least one active owner is required.' }, 403)
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
