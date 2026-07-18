import { describe, it, expect } from 'vitest'
import { emptiesOwed } from './format'

describe('emptiesOwed', () => {
  it('positive → customer owes the agency', () => {
    expect(emptiesOwed(5)).toEqual({ count: 5, owedBy: 'customer' })
  })

  it('negative (over-return) → agency owes the customer, no minus sign', () => {
    expect(emptiesOwed(-3)).toEqual({ count: 3, owedBy: 'agency' })
  })

  it('zero → settled', () => {
    expect(emptiesOwed(0)).toEqual({ count: 0, owedBy: 'none' })
  })
})
