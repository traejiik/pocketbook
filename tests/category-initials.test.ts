import { describe, expect, it } from 'vitest'
import { initials } from '@/lib/colors'

describe('category avatar initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Emergency Fund')).toBe('EF')
    expect(initials('Rent')).toBe('R')
    expect(initials('food and groceries')).toBe('FA')
  })

  it('skips a word that is only punctuation', () => {
    expect(initials('Food & Groceries')).toBe('FG')
    expect(initials('Bills + Utilities')).toBe('BU')
  })

  it('skips leading punctuation inside a word', () => {
    expect(initials('Allowance (Home)')).toBe('AH')
    expect(initials('"Fun" money')).toBe('FM')
  })

  it('handles digits and non-Latin letters', () => {
    expect(initials('401k Savings')).toBe('4S')
    expect(initials('Ételek és italok')).toBe('ÉÉ')
  })

  it('falls back to the first character when there is no letter at all', () => {
    expect(initials('🍔')).toBe('🍔')
    expect(initials('& +')).toBe('&')
  })

  it('returns an empty string for a blank name', () => {
    expect(initials('   ')).toBe('')
  })
})
