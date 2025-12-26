import { DurableObject } from 'cloudflare:workers';
import { Env, AgentState, Message, Task, TaskWorkflowParams } from '../types/env';
import { VectorizeManager } from './vectorize';
import { MemoryManager, DEFAULT_SYSTEM_PROMPT, memoryManager } from './memory';

import { ConfirmationHandler, createConfirmationHandler } from '../mcp/ConfirmationHandler';

import { getTool } from '../mcp/tools/index';
import { ToolContext } from '../types/tools';


interface WebSocketSession {
  webSocket: WebSocket;
  userId: string;
  connectedAt: number;
}

interface RateLimitState {
  weatherCalls: number[];  // Timestamps of weather API calls
  emailSends: number[];    // Timestamps of email sends
}

export class PersonalAssistant extends DurableObject<Env> {
  private sessions: Map<WebSocket, WebSocketSession>;
  private state: AgentState;
  private userId: string;
  private vectorize: VectorizeManager;
  private confirmationHandler: ConfirmationHandler;
  private rateLimits: Map<string, RateLimitState>; // userId -> rate limit state

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.vectorize = new VectorizeManager(env);
    this.confirmationHandler = createConfirmationHandler(60000);

    this.sessions = new Map();
    this.rateLimits = new Map();
    this.userId = '';
    this.state = {
      userId: '',
      conversationHistory: [],
      activeWebSockets: 0,
      lastActivity: Date.now(),
    };


    this.ctx.blockConcurrencyWhile(async () => {
      await this.loadState();
      await this.ensureForeignKeysEnabled();
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

        // Atomic session creation: check again to prevent race condition
        session = this.sessions.get(ws);
        if (session) {
          // Another concurrent call already recovered the session
          console.log('Session was recovered by another concurrent call');
        } else {
          // Proceed with recovery
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
            // Attachment not available
          }

          if (userId) {
            // Create session
            session = {
              webSocket: ws,
              userId: userId,
              connectedAt: connectedAt,
            };
            this.sessions.set(ws, session);
            this.state.activeWebSockets = this.sessions.size;
            console.log(`Session recovered for user: ${userId}`);
          } else {
            // Cannot recover
            console.error('Session not found and cannot recover - no userId available');
            ws.send(JSON.stringify({
              error: 'Session lost',
              message: 'Please reconnect to restore your session',
            }));
            return;
          }
        }
      }

     
      const data = typeof message === 'string' ? JSON.parse(message) : null;

      if (!data) {
        ws.send(JSON.stringify({ error: 'Invalid message format' }));
        return;
      }


      const payload = (data && typeof data.payload === 'object' && data.payload !== null)
        ? data.payload
        : data;

      switch (data.type) {
        case 'chat': {
          const content = payload?.content;
          if (typeof content !== 'string' || !content.trim()) {
            ws.send(JSON.stringify({ error: 'Chat message content is required' }));
            return;
          }
          await this.handleChatMessage(ws, session, content);
          break;
        }

        case 'create_task':
          await this.handleCreateTask(ws, session, payload);
          break;

        case 'list_tasks':
          await this.handleListTasks(ws, session);
          break;

        case 'complete_task':
          await this.handleCompleteTask(ws, session, payload.taskId);
          break;

        case 'update_task':
          await this.handleUpdateTask(ws, session, payload);
          break;

        case 'delete_task':
          await this.handleDeleteTask(ws, session, payload.taskId);
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        
        case 'confirmation_response':
          await this.handleConfirmationResponse(ws, session, payload);
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

  // Enable foreign key constraints for this D1 connection
  private async ensureForeignKeysEnabled(): Promise<void> {
    try {
      await this.env.DB.exec('PRAGMA foreign_keys = ON');
      console.log('[PersonalAssistant] Foreign key constraints enabled');
    } catch (error) {
      console.error('[PersonalAssistant] Error enabling foreign keys:', error);
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

// Generate LLM response using worker AI
private async generateLLMResponse(
  userId: string,
  userMessage: string,
  conversationHistory: Message[]
): Promise<string> {

    try {
      const context = memoryManager.buildContext(conversationHistory, {
        maxTokens: 3500,
        maxMessages: 50,
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
      });

      const messages = memoryManager.formatForLLM(context);

      const model = this.env.LLM_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
      const modelKey = (model as unknown) as keyof AiModels;
      if(!modelKey) throw new Error('No valid LLM model available');

      
      const maxTokens = parseInt(this.env.LLM_MAX_TOKENS || '500');
      const temperature = parseFloat(this.env.LLM_TEMPERATURE || '0.7');

      console.log(`[LLM] Calling model: ${model}, tokens: ${context.totalTokens}, truncated: ${context.truncated}`);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM timeout after 90s')), 90000)
        );

      const llmPromise = this.env.AI.run(modelKey, {
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }) as Promise<{ response: string }>;

      const response = await Promise.race([llmPromise, timeoutPromise]);

      const responseText = response?.response?.trim();
      if(!responseText) {
        throw new Error ('Empty response from LLM');
      }

      console.log(`[LLM] Response generated: ${responseText.length} chars`);
      return responseText;

    } catch (error) {
      console.error('[LLM] Error generating response:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('timeout')) {
     return 'I apologize, but my response took too long. Please try again.';
      } 
      
      else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        return 'I am experiencing high demand. Please try again in a moment.';
      } 
      
       else {
        return 'I encountered an error processing your message. Please try again.';
      }
    }
  }

  private async generateLLMResponseWithRAG(
    userId: string,
    userMessage: string,
    conversationHistory: Message[]
  ): Promise<string> {

    try {

      const rag_enabled = this.env.RAG_ENABLED !== 'false';
      if(!rag_enabled){
        console.log('[RAG] RAG disabled via environment variable');
        return await this.generateLLMResponse(userId, userMessage, conversationHistory);
      }

      const topK = parseInt(this.env.RAG_TOP_K || '3');
      console.log(`[RAG] Retrieving top ${topK} relevant items for user: ${userId}`);

      const [relevantHistory, relevantKnowledge] = await Promise.all([
        this.vectorize.getRelevantHistory(userId, userMessage, topK),
        this.vectorize.getRelevantKnowledge(userId, userMessage, Math.floor(topK / 2)),
      ]);

      const retrievedContext = [...relevantHistory, ...relevantKnowledge];

      if (retrievedContext.length === 0){
        console.log('[RAG] No relevant context found, using standard response');
        return await this.generateLLMResponse(userId, userMessage, conversationHistory);
      }
      
      console.log(`[RAG] Found ${retrievedContext.length} relevant items`);

      const context = memoryManager.prepareRAGContext(
        conversationHistory,
        retrievedContext,
        {
          maxTokens: 3500,
          maxMessages: 50,
          systemPrompt: DEFAULT_SYSTEM_PROMPT,
        }
      );

      const messages = memoryManager.formatForLLM(context);

      const model = this.env.LLM_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

      const modelKey = (model as unknown) as keyof AiModels;
      if (!modelKey) throw new Error('No valid LLM model available');

      const maxTokens = parseInt(this.env.LLM_MAX_TOKENS || '500');
      const temperature = parseFloat(this.env.LLM_TEMPERATURE || '0.7');

      console.log(`[LLM] Calling with RAG context - tokens: ${context.totalTokens}, truncated: ${context.truncated}`);

      const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('LLM timeout after 90s')), 90000)
    );

      const llmPromise = this.env.AI.run(modelKey, {
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }) as Promise<{ response: string }>;

      const response = await Promise.race([llmPromise, timeoutPromise]);

      const responseText = response?.response?.trim();

      if (!responseText) {
        throw new Error('Empty response from LLM');
      }

      console.log(`[LLM] RAG-enhanced response generated: ${responseText.length} chars`);
      return responseText;

    } catch (error) {
      console.error('[RAG] Error generating RAG response, falling back to standard:', error);

      // Fallback to non-RAG on error
      return await this.generateLLMResponse(userId, userMessage, conversationHistory);
    }
  }
  // ==================== WebSocket Message Handlers ====================

  // Handle chat messages 
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

    // Store user message embedding (silently fails if Vectorize unavailable in local dev)
    await this.vectorize.storeMessageEmbedding(
      session.userId,
      userMessage,
      'conversation'
    );

    const responseContent = await this.generateLLMResponseWithRAG(
      session.userId,
      content,
      this.state.conversationHistory
    );

    const toolCalls = this.extractJSONBlocks(responseContent);

    if (toolCalls.length > 0) {
      console.log(`[PersonalAssistant] Detected ${toolCalls.length} tool call(s) in response`);

      const toolResultMessage: string[] = [];

      for (const toolCall of toolCalls) {
        const executionResult = await this.executeToolsWithConfirmation(ws, session, toolCall);

        ws.send(JSON.stringify({
          type: 'tool_execution_result',
          payload: {
            success: executionResult.success,
            output: executionResult.output,
            error: executionResult.error,
            toolName: toolCall.tool,
          },
          timestamp: Date.now(),
        }));

    const formattedResult = this.formatToolResultAsSystemMessage(toolCall.tool, executionResult);
    toolResultMessage.push(formattedResult);

    const systemMessage: Message = {
      id: crypto.randomUUID(),
      role: 'system',
      content: formattedResult,
      timestamp: Date.now(),
    };
    this.state.conversationHistory.push(systemMessage);

    await this.saveMessageToD1(session.userId, systemMessage);
    }

    console.log('[PersonalAssistant] Calling LLM with tool results in context');
    const followUpResponse = await this.generateLLMResponseWithRAG(
      session.userId,
      content,
      this.state.conversationHistory 
    );

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: followUpResponse,
      timestamp: Date.now(),
    };
    this.state.conversationHistory.push(assistantMessage);

    await this.saveMessageToD1(session.userId, assistantMessage);

    // // Store assistant message embedding (silently fails if Vectorize unavailable in local dev)
    // await this.vectorize.storeMessageEmbedding(
    //   session.userId,
    //   assistantMessage,
    //   'conversation'
    // );

    ws.send(JSON.stringify({
      type: 'chat_response',
      payload: {
        content: followUpResponse,
        messageId: assistantMessage.id,
      },
      timestamp: assistantMessage.timestamp,
    }));
    return;
  }
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

  // Handle confirmation response from user
  private async handleConfirmationResponse(ws: WebSocket, session: WebSocketSession, data: any) {
    try {
      const response = {
        requestId: data.requestId,
        approved: data.approved,
        timestamp: data.timestamp || Date.now(),
      };

      const processed = this.confirmationHandler.handleConfirmationResponse(response);

      if (processed) {
        console.log(`[PersonalAssistant] Confirmation response processed: ${response.requestId}`);
      } else {
        console.warn(`[PersonalAssistant] Unknown confirmation request: ${response.requestId}`);
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Confirmation request not found or expired',
          timestamp: Date.now(),
        }));
      }
    } catch (error) {
      console.error('[PersonalAssistant] Error handling confirmation response:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to process confirmation response',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }));
    }
  }

  // Rate limiting helpers
  checkRateLimit(userId: string, type: 'weather' | 'email', maxCalls: number = 10, windowMs: number = 3600000): boolean {
    const now = Date.now();
    let userLimits = this.rateLimits.get(userId);

    if (!userLimits) {
      userLimits = { weatherCalls: [], emailSends: [] };
      this.rateLimits.set(userId, userLimits);
    }

    const calls = type === 'weather' ? userLimits.weatherCalls : userLimits.emailSends;

    // Remove calls outside the time window
    const validCalls = calls.filter(timestamp => now - timestamp < windowMs);

    if (validCalls.length >= maxCalls) {
      return false; // Rate limit exceeded
    }

    return true; // Within limits
  }

  recordRateLimitCall(userId: string, type: 'weather' | 'email'): void {
    const now = Date.now();
    let userLimits = this.rateLimits.get(userId);

    if (!userLimits) {
      userLimits = { weatherCalls: [], emailSends: [] };
      this.rateLimits.set(userId, userLimits);
    }

    if (type === 'weather') {
      userLimits.weatherCalls.push(now);
    } else {
      userLimits.emailSends.push(now);
    }

    // Keep only last 24 hours of data to prevent memory bloat
    const oneDayAgo = now - 86400000;
    userLimits.weatherCalls = userLimits.weatherCalls.filter(t => t > oneDayAgo);
    userLimits.emailSends = userLimits.emailSends.filter(t => t > oneDayAgo);
  }

  // Extract JSON blocks from LLM response (tool calls) - ReDoS-safe implementation
  private extractJSONBlocks(text: string): Array<{ tool: string; params: any }> {
    // Security: Limit input length to prevent ReDoS attacks (max 50KB)
    const MAX_INPUT_LENGTH = 50 * 1024;
    if (text.length > MAX_INPUT_LENGTH) {
      console.warn(`[PersonalAssistant] Input too long for JSON extraction: ${text.length} chars (max ${MAX_INPUT_LENGTH})`);
      return [];
    }

    const toolCalls: Array<{ tool: string; params: any }> = [];

    try {
      // Security: Use timeout wrapper for regex execution (max 1 second)
      const timeoutMs = 1000;
      const startTime = Date.now();

      // More efficient regex without nested quantifiers (prevents ReDoS)
      const jsonBlockRegex = /```json\n([^`]+)```/g;
      let match;

      while ((match = jsonBlockRegex.exec(text)) !== null) {
        // Security: Check timeout
        if (Date.now() - startTime > timeoutMs) {
          console.warn('[PersonalAssistant] JSON extraction timeout exceeded');
          break;
        }

        try {
          const jsonContent = match[1].trim();
          const parsed = JSON.parse(jsonContent);

          if (parsed.tool && parsed.params) {
            toolCalls.push({
              tool: parsed.tool,
              params: parsed.params
            });
          }
        } catch (e) {
          console.warn('[PersonalAssistant] Failed to parse JSON block:', e);
        }
      }
    } catch (error) {
      console.error('[PersonalAssistant] Error in JSON extraction:', error);
    }

    return toolCalls;
  }

/**
   * Execute tool calls with user confirmation
   */
  private async executeToolsWithConfirmation(
    ws: WebSocket,
    session: WebSocketSession,
    toolCall: { tool: string; params: any }
  ): Promise<{ success: boolean; output?: any; error?: string }> {

    try {
      console.log('[PersonalAssistant] Preparing tool execution');

      const toolContext: ToolContext = {
        userId: session.userId,
        env: this.env,
        agent: this,
      };

      // Get the tool definition
      const toolDef = getTool(toolCall.tool);

      // Check if tool exists
      if (!toolDef) {
        console.error(`[PersonalAssistant] Tool not found: ${toolCall.tool}`);
        return {
          success: false,
          error: `Tool not found: ${toolCall.tool}`,
        };
      }

      // Create tool call summary for confirmation
      const toolCallSummary = {
        toolName: toolCall.tool,
        parameters: toolCall.params,
        description: `Calling ${toolCall.tool} with ${JSON.stringify(toolCall.params)}`,
      };

      console.log(`[PersonalAssistant] Requesting confirmation for ${toolCall.tool}`);

      // Request user confirmation
      const approved = await this.confirmationHandler.requestConfirmation(
        session.userId,
        JSON.stringify({ tool: toolCall.tool, params: toolCall.params }, null, 2), // Formatted JSON for display
        [toolCallSummary],
        (request) => {
          ws.send(JSON.stringify({
            type: 'confirmation_request',
            payload: request,
            timestamp: Date.now(),
          }));
        },
        60000
      );

      if (!approved) {
        console.log('[PersonalAssistant] Tool execution rejected by user');
        return {
          success: false,
          error: 'Tool execution rejected or timed out',
        };
      }

      console.log('[PersonalAssistant] Tool execution approved, executing now');

      // Validate parameters with Zod schema
      const validationResult = toolDef.parameters.safeParse(toolCall.params);
      if (!validationResult.success) {
        console.error('[PersonalAssistant] Parameter validation failed:', validationResult.error);
        return {
          success: false,
          error: `Invalid parameters: ${validationResult.error.message}`,
        };
      }

      // Execute the tool
      const result = await toolDef.execute(validationResult.data, toolContext);

      console.log('[PersonalAssistant] Tool execution completed:', result.success ? 'SUCCESS' : 'FAILED');

      return {
        success: result.success,
        output: result.data,
        error: result.error,
      };

    } catch (error) {
      console.error('[PersonalAssistant] Error in code execution:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

// Convert raw tool output to contextual information for LLM
private formatToolResultAsSystemMessage(
  toolName: string,
  result: { success: boolean; output?: any; error?: string 
  }
): string {
  if (!result.success) {
    return `[Tool Execution] ${toolName} failed: ${result.error || 'Unknown error'}`;
  }

     switch (toolName) {
        case 'getWeather': {
          const weather = result.output as any;
          return `[Weather Data Retrieved] ${weather.city}, ${weather.country}: ${weather.temperature}°C (feels like ${weather.feelsLike}°C), ${weather.description}. Humidity: ${weather.humidity}%, Wind: ${weather.windSpeed} m/s`;
        }

        case 'sendEmail': {
          const email = result.output as any;
          return `[Email Sent] Successfully sent email to ${email.to} at ${email.submittedAt}. Message ID: ${email.messageId}`;
        }

        case 'createTask': {
          const task = result.output as any;
          return `[Task Created] "${task.title}" (ID: ${task.id}, Priority: ${task.priority}${task.dueDate ? ', Due: ' + new Date(task.dueDate * 1000).toISOString() : ''})`;   
        }
        case 'listTasks': {
          const tasks = result.output as any[];
          if (tasks.length === 0) {
            return `[Task List] No tasks found`;
          }
          const taskList = tasks.map(t => `- ${t.title} (${t.completed ? 'completed' : 'pending'})`).join('\n');
          return `[Task List] Found ${tasks.length} task(s):\n${taskList}`;
        }

        case 'updateTask': {
          const task = result.output as any;
          return `[Task Updated] "${task.title}" has been updated successfully`;
        }

        case 'completeTask': {
          const task = result.output as any;
          return `[Task Completed] "${task.title}" marked as complete`;
        }

        case 'deleteTask': {
          return `[Task Deleted] Task has been removed successfully`;
        }

        default: {
          // Generic fallback for unknown tools
          return `[Tool Executed] ${toolName} completed successfully with result: ${JSON.stringify(result.output)}`;
        }
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
    try {
      await this.ctx.storage.put('state', this.state);
    } catch (error) {
      console.error('[PersonalAssistant] Failed to save state:', error);
    }
  }


  async alarm() {
    console.log('Alarm triggered for user:', this.userId);

    // Clean up old confirmation requests to prevent memory leaks
    this.confirmationHandler.cleanupOldConfirmations();

    // Schedule next cleanup in 5 minutes
    await this.ctx.storage.setAlarm(Date.now() + 300000);
  }
}
