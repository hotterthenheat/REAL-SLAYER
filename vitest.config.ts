import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Component/DOM tests run under vitest + jsdom. Kept separate from the existing
// `tests/*.test.ts` logic suite (run by tsx via `npm test`) by scoping `include`
// to co-located src tests, so the two runners never fight over the same files.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
