import { stdout } from 'node:process';

// Deliver the one-time credential directly to the operator's container stdout.
// Keep it out of application events, browser responses and startup diagnostics.
export function printSetupCode(code: string): void {
  stdout.write([
    '',
    '==========[Setup]==========',
    '[setup] No account in database',
    '-------------------------------------------',
    'Use this setup code to create your account:',
    '',
    `\t${code}`,
    '',
    'This code expires after 30 minutes.',
    '-------------------------------------------',
    '',
  ].join('\n'));
}
