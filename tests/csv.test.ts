import { describe, expect, it } from 'vitest'
import { parseCsv, parseCsvRecords, toCsv } from '@/lib/csv'

describe('parseCsv', () => {
  it('splits plain rows and drops blank lines', () => {
    expect(parseCsv('a,b\n1,2\n\n3,4\n')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']])
  })

  it('keeps commas, newlines and escaped quotes inside quoted fields', () => {
    expect(parseCsv('d,n\n"Rent, flat 2","He said ""hi""\nthen left"')).toEqual([
      ['d', 'n'],
      ['Rent, flat 2', 'He said "hi"\nthen left'],
    ])
  })

  it('handles CRLF endings and strips a leading BOM', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('keeps empty trailing fields', () => {
    expect(parseCsv('a,b,c\n1,,\n')).toEqual([['a', 'b', 'c'], ['1', '', '']])
  })
})

describe('parseCsvRecords', () => {
  it('keys records by trimmed lower-case header and reports the file line', () => {
    const { headers, records } = parseCsvRecords(' Date ,Amount\n2026-01-01, 5 \n2026-01-02,6')
    expect(headers).toEqual(['date', 'amount'])
    expect(records).toEqual([
      { line: 2, values: { date: '2026-01-01', amount: '5' } },
      { line: 3, values: { date: '2026-01-02', amount: '6' } },
    ])
  })
})

describe('toCsv', () => {
  it('quotes only fields that need it and round-trips through parseCsv', () => {
    const rows = [['description', 'amount'], ['Rent, flat 2', -120000], ['Say "hi"', 4.99], ['', null]]
    const csv = toCsv(rows)
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('"Rent, flat 2",-120000\r\n')
    expect(parseCsv(csv)).toEqual([
      ['description', 'amount'],
      ['Rent, flat 2', '-120000'],
      ['Say "hi"', '4.99'],
    ])
  })
})
