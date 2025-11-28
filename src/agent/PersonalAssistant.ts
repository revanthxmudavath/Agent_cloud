import { DurableObject } from 'cloudflare:workers';
import { Env, AgentState, Message, Task, TaskWorkflowParams } from '../types/env';
import { VectorizeManager } from './vectorize';

interface WebSocketSession {
  webSocket: WebSocket;
  userId: string;
  connectedAt: number;
}

export class PersonalAssistant extends DurableObject<Env> {
  private sessions: Map<WebSocket, WebSocketSession>;
  private state: AgentState;
  private userId: string;
  private vectorize: VectorizeManager;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.vectorize = new VectorizeManager(env);

    this.sessions = new Map();
    this.userId = '';
    this.state = {
      userId: '',
      conversationHistory: [],
      activeWebSockets: 0,
      lastActivity: Date.now(),
    };

   
    this.ctx.blockConcurrencyWhile(async () => {
      await this.loadState();
    });
  }

  // Main fetch handler 
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

   
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

  
    if (url.pathname === '/api/state') {
      return new Response(JSON.stringify(this.state), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  }

  // Handle WebSocket upgrade and connection
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

   
    if (!userId) {
      return new Response(JSON.stringify({
        error: 'userId is required',
        message: 'Connect with /ws?userId=<your-user-id>'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

   
    const canonicalUserId = this.state.userId || userId;

    if (this.state.userId && this.state.userId !== userId) {
      return new Response(JSON.stringify({
        error: 'userId mismatch',
        message: 'Connection attempted with a different userId than this agent handles'
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);


    this.ctx.acceptWebSocket(server, [canonicalUserId]);

    // Serialize session metadata for hibernation recovery
    const sessionMetadata = {
      userId: canonicalUserId,
      connectedAt: Date.now(),
    };
    (server as any).serializeAttachment?.(sessionMetadata);

    
    const session: WebSocketSession = {
      webSocket: server,
      userId: canonicalUserId,
      connectedAt: Date.now(),
    };
    this.sessions.set(server, session);
    this.userId = canonicalUserId;
    this.state.userId = canonicalUserId;
    this.state.activeWebSockets = this.sessions.size;
    await this.saveState();

    // Send welcome message
    server.send(JSON.stringify({
      type: 'connected',
      userId: canonicalUserId,
      message: 'Connected to Personal Assistant',
      timestamp: Date.now(),
    }));

    
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  // WebSocket message handler
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      let session = this.sessions.get(ws);

      
      if (!session) {
        console.log('Session not found, attempting recovery...');

        
        const tags = (ws as any).tags || [];
        let userId = tags[0];
        let connectedAt = Date.now();

       
        try {
          const attachment = (ws as any).deserializeAttachment?.();
          if (attachment) {
            userId = attachment.userId || userId;
            connectedAt = attachment.connectedAt || connectedAt;
          }
        } catch (e) {
          
        }

        if (userId) {
         
          session = {
            webSocket: ws,
            userId: userId,
            connectedAt: connectedAt,
          };
          this.sessions.set(ws, session);
          this.state.activeWebSockets = this.sessions.size;
          console.log(`Session recovered for user: ${userId}`);
        } else {
         
          console.error('Session not found and cannot recover - no userId available');
          ws.send(JSON.stringify({
            error: 'Session lost',
            message: 'Please reconnect to restore your session',
          }));
          return;
        }
      }

     
      const data = typeof message === 'string' ? JSON.parse(message) : null;

      if (!data) {
        ws.send(JSON.stringify({ error: 'Invalid message format' }));
        return;
      }


      switch (data.type) {
        case 'chat':
          await this.handleChatMessage(ws, session, data.content);
          break;

        case 'create_task':
          await this.handleCreateTask(ws, session, data);
          break;

        case 'list_tasks':
          await this.handleListTasks(ws, session);
          break;

        case 'complete_task':
          await this.handleCompleteTask(ws, session, data.taskId);
          break;

        case 'update_task':
          await this.handleUpdateTask(ws, session, data);
          break;

        case 'delete_task':
          await this.handleDeleteTask(ws, session, data.taskId);
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;

        default:
          ws.send(JSON.stringify({ error: 'Unknown message type' }));
      }

      
      this.state.lastActivity = Date.now();
      await this.saveState();

    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      ws.send(JSON.stringify({
        error: 'Internal error processing message',
        details: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }

  // WebSocket close handler
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const session = this.sessions.get(ws);
    if (session) {
      console.log(`WebSocket closed for user ${session.userId}. Code: ${code}, Reason: ${reason}`);
      this.sessions.delete(ws);
      this.state.activeWebSockets = this.sessions.size;
    }

    
    await this.saveState();
  }

  // WebSocket error handler
  async webSocketError(ws: WebSocket, error: unknown) {
    console.error('WebSocket error:', error);
    const session = this.sessions.get(ws);
    if (session) {
      this.sessions.delete(ws);
      this.state.activeWebSockets = this.sessions.size;
    }
  }

  // Ensure user exists in database
  private async ensureUser(userId: string): Promise<void> {
    try {
      const existing = await this.env.DB.prepare(
        'SELECT id FROM users WHERE id = ?'
      ).bind(userId).first();

      if (!existing) {
        const now = Math.floor(Date.now() / 1000);
        await this.env.DB.prepare(
          'INSERT INTO users (id, name, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(
          userId,
          `User_${userId.slice(0, 8)}`,
          'UTC',
          now,
          now
        ).run();
        console.log(`Auto-created user profile for: ${userId}`);
      }
    } catch (error) {
      console.error('Error ensuring user exists:', error);

    }
  }

  // D1 Task CRUD Operations 

  // Create a new task
  private async createTask(
    userId: string,
    title: string,
    description?: string,
    dueDate?: number,
    priority: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<Task> {
    const taskId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    await this.env.DB.prepare(
      'INSERT INTO tasks (id, user_id, title, description, due_date, priority, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      taskId,
      userId,
      title,
      description || null,
      dueDate || null,
      priority,
      0,
      now
    ).run();

    return {
      id: taskId,
      userId,
      title,
      description,
      dueDate,
      completed: false,
      priority,
      createdAt: now,
    };
  }

  // Get a single task by ID
  private async getTask(userId: string, taskId: string): Promise<Task | null> {
    const result = await this.env.DB.prepare(
      'SELECT * FROM tasks WHERE id = ? AND user_id = ?'
    ).bind(taskId, userId).first();

    if (!result) {
      return null;
    }

    return this.mapDbTaskToTask(result);
  }

  // List all tasks for a user
  private async listUserTasks(userId: string, completed?: boolean): Promise<Task[]> {
    let query = 'SELECT * FROM tasks WHERE user_id = ?';
    const params: any[] = [userId];

    if (completed !== undefined) {
      query += ' AND completed = ?';
      params.push(completed ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.env.DB.prepare(query).bind(...params).all();

    return (result.results || []).map(row => this.mapDbTaskToTask(row));
  }

  // Update task fields
  private async updateTask(
    userId: string,
    taskId: string,
    updates: {
      title?: string;
      description?: string;
      dueDate?: number;
      priority?: 'low' | 'medium' | 'high';
    }
  ): Promise<Task> {
  
    const existing = await this.getTask(userId, taskId);
    if (!existing) {
      throw new Error('Task not found');
    }

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description || null);
    }
    if (updates.dueDate !== undefined) {
      fields.push('due_date = ?');
      values.push(updates.dueDate || null);
    }
    if (updates.priority !== undefined) {
      fields.push('priority = ?');
      values.push(updates.priority);
    }

    if (fields.length > 0) {
      values.push(taskId, userId);
      await this.env.DB.prepare(
        `UPDATE tasks SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
      ).bind(...values).run();
    }

    
    const updated = await this.getTask(userId, taskId);
    if (!updated) {
      throw new Error('Failed to fetch updated task');
    }

    return updated;
  }

  // Mark task as completed
  private async completeTask(userId: string, taskId: string): Promise<Task> {
   
    const existing = await this.getTask(userId, taskId);
    if (!existing) {
      throw new Error('Task not found');
    }

    const completedAt = Math.floor(Date.now() / 1000);

    await this.env.DB.prepare(
      'UPDATE tasks SET completed = ?, completed_at = ? WHERE id = ? AND user_id = ?'
    ).bind(1, completedAt, taskId, userId).run();

    
    const updated = await this.getTask(userId, taskId);
    if (!updated) {
      throw new Error('Failed to fetch completed task');
    }

    return updated;
  }

  // Delete a task
  private async deleteTask(userId: string, taskId: string): Promise<void> {
    // Verify task exists and belongs to user
    const existing = await this.getTask(userId, taskId);
    if (!existing) {
      throw new Error('Task not found');
    }

    await this.env.DB.prepare(
      'DELETE FROM tasks WHERE id = ? AND user_id = ?'
    ).bind(taskId, userId).run();
  }

  // Helper to map DB row to Task interface
  private mapDbTaskToTask(row: any): Task {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      title: row.title as string,
      description: row.description as string | undefined,
      dueDate: row.due_date as number | undefined,
      completed: Boolean(row.completed),
      priority: (row.priority as 'low' | 'medium' | 'high') || 'medium',
      createdAt: row.created_at as number,
      completedAt: row.completed_at as number | undefined,
    };
  }

  // Save message to D1 conversations table
  private async saveMessageToD1(userId: string, message: Message): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    await this.env.DB.prepare(
      'INSERT INTO conversations (id, user_id, role, content, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        message.id,
        userId,
        message.role,
        message.content,
        now,
        message.metadata ? JSON.stringify(message.metadata) : null
      ).run();
  }

  // Load conversation history from D1
private async loadConversationHistory(userId: string, limit: number = 50): Promise<Message[]> {
    const result = await this.env.DB.prepare(
      'SELECT id, role, content, timestamp, metadata FROM conversations WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?'
    ).bind(userId, limit).all();
    
    if (!result.results || result.results.length === 0) {
      return [];
    }

    return result.results.reverse().map(row => ({
      id: row.id as string,
      role: row.role as 'user' | 'assistant' | 'system',
      content: row.content as string,
      timestamp: (row.timestamp as number) * 1000,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    }));
}

  // ==================== WebSocket Message Handlers ====================

  // Handle chat messages (placeholder - will be implemented with LLM in Phase 3)
  private async handleChatMessage(ws: WebSocket, session: WebSocketSession, content: string) {
   
    await this.ensureUser(session.userId);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    this.state.conversationHistory.push(userMessage);

    await this.saveMessageToD1(session.userId, userMessage);

    // Store user message embedding and check result
    const userEmbeddingStored = await this.vectorize.storeMessageEmbedding(
      session.userId,
      userMessage,
      'conversation'
    );
    if (!userEmbeddingStored) {
      console.warn(`Failed to store user message embedding: ${userMessage.id}`);
    }

    // TODO: Phase 3 - Generate LLM response
    // For now, send a placeholder response
    const responseContent = `Echo: ${content}`;
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: responseContent,
      timestamp: Date.now(),
    };
    this.state.conversationHistory.push(assistantMessage);

    await this.saveMessageToD1(session.userId, assistantMessage);

    // Store assistant message embedding and check result
    const assistantEmbeddingStored = await this.vectorize.storeMessageEmbedding(
      session.userId,
      assistantMessage,
      'conversation'
    );
    if (!assistantEmbeddingStored) {
      console.warn(`Failed to store assistant message embedding: ${assistantMessage.id}`);
    }

    ws.send(JSON.stringify({
      type: 'chat_response',
      content: responseContent,
      timestamp: Date.now(),
    }));
  }

  // Handle task creation
  private async handleCreateTask(ws: WebSocket, session: WebSocketSession, data: any) {
    await this.ensureUser(session.userId);

    try {
      const task = await this.createTask(
        session.userId,
        data.title,
        data.description,
        data.dueDate,
        data.priority
      );

      if (task.dueDate) {
        try {
          const reminderTime = task.dueDate - (24 * 60 * 60); 
          const now = Math.floor(Date.now() / 1000);

          
          if (reminderTime > now) {
            const workflowParams: TaskWorkflowParams = {
              userId: session.userId,
              taskId: task.id,
              action: 'reminder',
              dueDate: task.dueDate,
              taskDetails: {
                title: task.title,
                description: task.description,
                priority: task.priority,
              },
            };

            const instance = await this.env.TASK_WORKFLOW.create({
              params: workflowParams,
            });

            console.log(`[PersonalAssistant] Scheduled reminder workflow: ${instance.id} for task: ${task.title}`);
          } else {
            console.log(`[PersonalAssistant] Task due date too soon for reminder (less than 24h): ${task.title}`);
          }
        } catch (error) {
          console.error('[PersonalAssistant] Failed to schedule reminder workflow:', error);
      
        }
      }

      ws.send(JSON.stringify({
        type: 'task_created',
        task,
        timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('Error creating task:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to create task',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }));
    }
  }

  // Handle task listing
  private async handleListTasks(ws: WebSocket, session: WebSocketSession) {
    await this.ensureUser(session.userId);

    try {
      const tasks = await this.listUserTasks(session.userId);

      ws.send(JSON.stringify({
        type: 'tasks_list',
        tasks,
        count: tasks.length,
        timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('Error listing tasks:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to list tasks',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }));
    }
  }

  // Handle task completion
  private async handleCompleteTask(ws: WebSocket, session: WebSocketSession, taskId: string) {
    await this.ensureUser(session.userId);

    try {
      if (!taskId) {
        throw new Error('taskId is required');
      }

      const task = await this.completeTask(session.userId, taskId);

      ws.send(JSON.stringify({
        type: 'task_completed',
        task,
        timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('Error completing task:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to complete task',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }));
    }
  }

  // Handle task update
  private async handleUpdateTask(ws: WebSocket, session: WebSocketSession, data: any) {
    await this.ensureUser(session.userId);

    try {
      if (!data.taskId) {
        throw new Error('taskId is required');
      }

      const task = await this.updateTask(session.userId, data.taskId, {
        title: data.title,
        description: data.description,
        dueDate: data.dueDate,
        priority: data.priority,
      });

      ws.send(JSON.stringify({
        type: 'task_updated',
        task,
        timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('Error updating task:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to update task',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }));
    }
  }

  // Handle task deletion
  private async handleDeleteTask(ws: WebSocket, session: WebSocketSession, taskId: string) {
    await this.ensureUser(session.userId);

    try {
      if (!taskId) {
        throw new Error('taskId is required');
      }

      await this.deleteTask(session.userId, taskId);

      ws.send(JSON.stringify({
        type: 'task_deleted',
        taskId,
        timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('Error deleting task:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to delete task',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }));
    }
  }

  // Load state from Durable Object storage
  private async loadState() {
    const stored = await this.ctx.storage.get<AgentState>('state');
    if (stored) {
      this.state = stored;
      this.userId = stored.userId;

      if(this.userId) {
        this.state.conversationHistory = await this.loadConversationHistory(this.userId);

      }
     
      this.rebuildSessions();
    }
  }

  // Rebuild sessions Map from active WebSockets
  private rebuildSessions() {
    const activeWebSockets = this.ctx.getWebSockets();

   
    this.sessions.clear();

    
    for (const ws of activeWebSockets) {
      
      const tags = (ws as any).tags || [];
      let userId = tags[0] || this.userId; 
      let connectedAt = Date.now();

      
      try {
        const attachment = (ws as any).deserializeAttachment?.();
        if (attachment) {
          userId = attachment.userId || userId;
          connectedAt = attachment.connectedAt || connectedAt;
        }
      } catch (e) {
        // Attachment not available or failed to deserialize, use defaults
      }

     
      this.sessions.set(ws, {
        webSocket: ws,
        userId,
        connectedAt,
      });
    }

    
    this.state.activeWebSockets = this.sessions.size;
  }

  // Save state to Durable Object storage
  private async saveState() {
    await this.ctx.storage.put('state', this.state);
  }

  
  async alarm() {
   
    console.log('Alarm triggered for user:', this.userId);
  }
}
