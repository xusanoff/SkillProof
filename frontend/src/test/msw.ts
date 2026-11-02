import { setupServer } from 'msw/node';

/** Base URL the browser-side API client resolves to in tests (jsdom origin + /api). */
export const API = 'http://localhost:3000/api';

export const server = setupServer();
