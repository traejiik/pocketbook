import nextConfig from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextConfig,
  {
    ignores: ['other/', 'node_modules/', '.next/', 'ds-bundle/'],
  },
  {
    rules: {
      // useEffect(() => setState(x), []) is a valid hydration guard pattern —
      // React Compiler rule is too strict for a codebase not opting in to the compiler.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    // Application code logs through lib/logger.ts so every line is timestamped,
    // scoped, and redacted (AGENTS.md rule 19). Build-time scripts under
    // scripts/ and prisma/ print to a human at a terminal and are exempt.
    files: [
      'app/**/*.{ts,tsx}',
      'components/**/*.{ts,tsx}',
      'contexts/**/*.{ts,tsx}',
      'hooks/**/*.{ts,tsx}',
      'lib/**/*.ts',
      'server-actions/**/*.ts',
      'runtime/**/*.ts',
      'instrumentation.ts',
      'proxy.ts',
    ],
    rules: { 'no-console': 'error' },
  },
];

export default config;
