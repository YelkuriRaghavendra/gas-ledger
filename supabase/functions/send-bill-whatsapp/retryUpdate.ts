// Retry helper for the post-send status update in index.ts.
//
// After a successful Meta send, the claimed whatsapp_sends row must be
// flipped from 'pending' to 'sent' (or 'failed'). If that update fails, the
// row is left reading as a stale 'pending' claim: after STALE_CLAIM_MS the
// UI offers Retry, and Retry takes over the abandoned claim and sends again
// — a duplicate message to the customer, which is exactly what the
// claim-before-send design exists to prevent. Retrying the update a few
// times closes the realistic case (a transient DB error). It does NOT close
// a mid-flight process teardown between the Meta call and the update — that
// needs a reconciliation pass and is out of scope here.
//
// Kept in its own module (no Deno-specific APIs) so it is a plain function
// importable from a vitest test, the same way phone.ts/templates.ts are
// shared without needing a Deno test harness.

const RETRY_DELAYS_MS = [200, 600]

export interface UpdateOutcome {
  error: unknown | null
}

/**
 * Calls `attempt` up to 1 + RETRY_DELAYS_MS.length times (3 total), waiting
 * `sleep` between attempts, stopping at the first one that reports no error.
 * Returns true if some attempt succeeded, false if all of them failed.
 */
export async function updateWithRetry(
  attempt: () => Promise<UpdateOutcome>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<boolean> {
  for (let i = 0; ; i++) {
    const { error } = await attempt()
    if (!error) return true
    if (i >= RETRY_DELAYS_MS.length) return false
    await sleep(RETRY_DELAYS_MS[i])
  }
}
