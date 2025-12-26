import { describe, it, expect } from 'vitest';
import { createMockEnv, createMockDB } from './setup';

describe('Vitest Setup', () => {
it('should run basic test', () => {
    expect(1 + 1).toBe(2);
});

it('should create mock environment', () => {
    const env = createMockEnv();

    expect(env.LLM_MODEL).toBeDefined();
    expect(env.DB).toBeDefined();
});

it('should create mock database', async () => {
    const db = createMockDB();

    // Test prepare/bind/run flow
    const result = await db.prepare('SELECT * FROM users').bind().run();
    expect(result.success).toBe(true);
});
});