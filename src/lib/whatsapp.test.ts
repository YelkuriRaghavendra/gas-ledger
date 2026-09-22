import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: mockInvoke } } }))

import { sendBillWhatsApp } from './whatsapp'

describe('sendBillWhatsApp', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValue({ data: { status: 'sent' }, error: null })
  })

  it('invokes the edge function with only the bill id', async () => {
    sendBillWhatsApp(42)
    await Promise.resolve()
    expect(mockInvoke).toHaveBeenCalledWith('send-bill-whatsapp', { body: { bill_id: 42 } })
  })

  it('returns undefined synchronously so callers cannot block on it', () => {
    expect(sendBillWhatsApp(42)).toBeUndefined()
  })

  it('swallows a rejected invoke instead of throwing', async () => {
    mockInvoke.mockRejectedValue(new Error('network down'))
    expect(() => sendBillWhatsApp(42)).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
  })

  it('does not invoke for a non-positive bill id', () => {
    sendBillWhatsApp(0)
    expect(mockInvoke).not.toHaveBeenCalled()
  })
})
