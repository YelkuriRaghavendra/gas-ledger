import { describe, it, expect } from 'vitest'
import { validateCustomerDetails, isValidPhone, sanitizePhoneInput } from './validation'

const complete = { name: 'Taj Kitchen', phone: '9876543210', address: 'MG Road' }

describe('validateCustomerDetails', () => {
  it('accepts a customer with all three details', () => {
    expect(validateCustomerDetails(complete)).toBeNull()
  })

  it('asks for a name, which is how every other screen refers to the customer', () => {
    expect(validateCustomerDetails({ ...complete, name: '  ' })).toBe('Enter a name')
  })

  it('asks for a mobile number, without which no bill can be sent', () => {
    expect(validateCustomerDetails({ ...complete, phone: '' })).toBe('Enter a 10-digit mobile number')
  })

  it('rejects a mobile number that is short of ten digits', () => {
    expect(validateCustomerDetails({ ...complete, phone: '98765' })).toBe('Enter a 10-digit mobile number')
  })

  it('asks for a location, which the delivery round is planned from', () => {
    expect(validateCustomerDetails({ ...complete, address: '   ' })).toBe('Enter a location')
  })

  it('reports the first missing detail, in the order the form asks for them', () => {
    expect(validateCustomerDetails({ name: '', phone: '', address: '' })).toBe('Enter a name')
  })
})

describe('isValidPhone', () => {
  it('counts digits, ignoring how the number was typed', () => {
    expect(isValidPhone('98765 43210')).toBe(true)
    expect(isValidPhone('987654321')).toBe(false)
  })
})

describe('sanitizePhoneInput', () => {
  it('keeps digits only and stops at ten', () => {
    expect(sanitizePhoneInput('+91 98765-432109999')).toBe('9198765432')
  })
})
