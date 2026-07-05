// Vitest DOM setup: adds @testing-library/jest-dom matchers (toBeInTheDocument,
// toHaveClass, …) and auto-unmounts React trees between tests.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());
