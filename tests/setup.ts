import { beforeEach, afterEach } from "vitest";
import type { Env } from "../src/types/env";
/**
 * Global test setup file
 * Runs before each test to ensure clean state
 */

// Mock console to reduce noise in tests (optional)
global.console = {
    ...console,
    log: () => {}, // Suppress logs in tests
    debug: () => {},
    // Keep error/warn for debugging
    error: console.error,
    warn: console.warn,
};

// Reset state before each test
beforeEach(() => {
// Add any global setup here
});

afterEach(() => {
// Add any global cleanup here
});

/**
 * Helper: Wait for a promise with timeout
 */
export async function waitFor<T>(
fn: () => Promise<T>,
timeout: number = 5000
): Promise<T> {
const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), timeout)
);
return Promise.race([fn(), timeoutPromise]);
}

/**
 * Helper: Mock WebSocket for testing
 */
export class MockWebSocket {
readyState = 1; // OPEN
messages: any[] = [];

send(data: string) {
    this.messages.push(JSON.parse(data));
}

close() {
    this.readyState = 3; // CLOSED
}
}

/**
 * Helper: Create mock Env for testing
 */
export function createMockEnv(overrides: Partial<Env> = {}): Env {
return {
    AI: {} as any,
    DB: {} as any,
    VECTORIZE: {} as any,
    PERSONAL_ASSISTANT: {} as any,
    TASK_WORKFLOW: {} as any,
    LLM_MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    LLM_MAX_TOKENS: '500',
    LLM_TEMPERATURE: '0.7',
    RAG_ENABLED: 'true',
    RAG_TOP_K: '3',
    OPENWEATHER_API_KEY: 'test-key',
    POSTMARK_API_TOKEN: 'test-token',
    POSTMARK_FROM_EMAIL: 'test@example.com',
    ...overrides,
} as Env;
}

/**
 * Helper: Create mock D1 database
 */
export function createMockDB() {
const mockResults = new Map<string, any[]>();

return {
    prepare: (query: string) => ({
    bind: (...params: any[]) => ({
        run: async () => ({ success: true, meta: {} }),
        all: async () => ({ results: mockResults.get(query) || [] }),
        first: async () => (mockResults.get(query) || [])[0] || null,
    }),
    }),
    batch: async (statements: any[]) => statements.map(() => ({ success: true })),
    exec: async (query: string) => ({ count: 1, duration: 10 }),
    dump: async () => new ArrayBuffer(0),

    // Test helpers
    _setMockResults: (query: string, results: any[]) => {
    mockResults.set(query, results);
    },
    _clear: () => {
    mockResults.clear();
    },
};
}