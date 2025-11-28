import { Hono } from "hono"; // Hono web api framework for Cloudflare Workers
import { PersonalAssistant } from "./agent/PersonalAssistant";
import { Env } from "./types/env";
import { TaskWorkflow } from "./workflows/TaskWorkflow";

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => {
    return c.json({ status: 'healthy' });
});

// user registry
app.post('/api/users/register', async (c) => {
    try {
        const body = await c.req.json().catch(() => ({}));

        const userId = crypto.randomUUID();
        const name = body.name || `User_${userId.slice(0, 8)}`;
        const timezone = body.timezone || 'UTC';
        const preferences = body.preferences ? JSON.stringify(body.preferences) : null;
        const now = Math.floor(Date.now() / 1000);

      
        await c.env.DB.prepare(
            'INSERT INTO users (id, name, timezone, preferences, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(userId, name, timezone, preferences, now, now).run();

        return c.json({
            userId,
            name,
            timezone,
            preferences: preferences ? JSON.parse(preferences) : null,
            createdAt: now,
            message: 'User registered successfully. Use this userId to connect to WebSocket.'
        }, 201);
    } catch (error) {
        console.error('Error registering user:', error);
        return c.json({
            error: 'Failed to register user',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
    }
});

// id generation endpoint
app.get('/api/users/generate-id', (c) => {
    const userId = crypto.randomUUID();
    return c.json({
        userId,
        message: 'Use this userId to connect to WebSocket. User profile will be created automatically on first connection.'
    });
});

// HTTP to websocket upgrade endpoint
app.get('/ws', async (c)  =>  {
    const upgradeHeader = c.req.header("Upgrade");
    if (upgradeHeader !== "websocket") {
        return c.json({ error: "Expected WebSocket Upgrade" }, 426);
    }

    
    const userId = c.req.query('userId');
    if (!userId) {
        return c.json({
            error: "userId query parameter is required",
            message: "Please connect with /ws?userId=<your-user-id>"
        }, 400);
    }

    try {
        const id = c.env.AGENT.idFromName(userId);
        const stub = c.env.AGENT.get(id);
        return stub.fetch(c.req.raw);
    } catch (error) {
        console.error('Error connecting to Durable Object:', error);
        return c.json({
            error: 'Failed to establish WebSocket connection',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
    }
})

// user info
app.get('/api/user/:userId', async (c) => {
    const userId = c.req.param('userId');

    const result = await c.env.DB.prepare(
        'SELECT id, name, timezone, preferences, created_at FROM users WHERE id = ?'
    ).bind(userId).first();

    if (!result) {
        return c.json({ error: 'User not found' }, 404);    
    }

    return c.json(result);
})

// get user tasks
app.get('/api/user/:userId/tasks', async (c) => {
    const userId = c.req.param('userId');
    const completed = c.req.query('completed');

    let query = 'SELECT * FROM tasks WHERE user_id = ?';  
    const params: any[] = [userId];
    
    if (completed !== undefined) {
        query += ' AND completed = ?';
        params.push(completed === 'true' ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC';

    const result = await c.env.DB.prepare(query).bind(...params).all();

    return c.json({ tasks: result.results || [] });

});

// get user conversations
app.get('/api/user/:userId/conversations', async (c) => {
    const userId = c.req.param('userId');
    const limit = parseInt(c.req.query('limit') || '50');
    
    const result = await c.env.DB.prepare(
        'SELECT * FROM conversations WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?'
    ).bind(userId, limit).all(); 

    return c.json({ conversations: result.results || [] });
});

export { PersonalAssistant, TaskWorkflow };

// Cloudflare Worker entry point
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        return app.fetch(request, env, ctx);
    },
};