import { assertEquals } from 'jsr:@std/assert@1'
import { cvMaximumHorizontalOverflow } from './cv.ts'

Deno.test('CV layout diagnostics report the largest horizontal overflow', () => {
  assertEquals(cvMaximumHorizontalOverflow('Output written on main.xdv (2 pages).'), 0)
  assertEquals(cvMaximumHorizontalOverflow([
    'Overfull \\hbox (12.5pt too wide) in paragraph',
    'Overfull \\hbox (891.02742pt too wide) in alignment',
  ].join('\n')), 891.02742)
})
