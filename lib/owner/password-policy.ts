const rules = [
  { valid: (password: string) => Array.from(password).length >= 12, message: 'Password must be at least 12 characters.' },
  { valid: (password: string) => !/[\r\n]/.test(password), message: 'Password must be on a single line.' },
  { valid: (password: string) => new TextEncoder().encode(password).length <= 72, message: 'Password must be at most 72 bytes in UTF-8.' },
];

export function passwordIssue(password: string) {
  return rules.find(rule => !rule.valid(password))?.message;
}
