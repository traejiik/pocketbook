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
];

export default config;
