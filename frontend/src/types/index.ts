// Backend types

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    metadata?: Record<string, any>;
}

export interface Task {
    id: string;
    userId: string;
    title: string;
    description?: string;
    dueDate?: number;
    completed: boolean;
    priority?: 'low' | 'medium' | 'high';
    createdAt: number;
    completedAt?: number;
    
}

export interface UserProfile {
    id: string;
    name?: string;
    timezone?: string;
    preferences?: Record<string, any>;
    createdAt: number;
  }


// Websocket types

export interface WSMessage {
    type: WSMessageType;
    payload: any;
    timestamp: number;
  }


  export type WSMessageType =
    | 'chat'
    | 'chat_response'
    | 'task'
    | 'status'
    | 'error'
    | 'connected'
    | 'confirmation_request'
    | 'confirmation_response'
    | 'tool_execution_result'
    | 'create_task'
    | 'list_tasks'
    | 'complete_task'
    | 'update_task'
    | 'delete_task'
    | 'ping';


  export interface ChatPayload {
    content: string;
  }


  export interface ChatResponsePayload {
    content: string;
    messageId: string;
  }

 
  export interface ToolCall {
    toolName: string;
    parameters: Record<string, any>;
    description?: string;
  }


  export interface ConfirmationRequestPayload {
    requestId: string;
    code: string; // JSON tool call
    toolCalls: ToolCall[];
    timeout: number;
  }

  
  export interface ConfirmationResponsePayload {
    requestId: string;
    approved: boolean;
    timestamp: number;
  }

 
  export interface ToolExecutionResultPayload {
    requestId: string;
    toolName: string;
    success: boolean;
    result?: any;
    error?: string;
  }


  export interface ErrorPayload {
    message: string;
    code?: string;
  }

 
  export interface StatusPayload {
    message: string;
    type?: 'info' | 'warning' | 'success';
  }

 
  export interface ConnectedPayload {
    userId: string;
    message: string;
  }

// Frontend types

  export type ConnectionStatus =
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'error';


  export interface PendingConfirmation {
    requestId: string;
    toolCalls: ToolCall[];
    code: string;
    expiresAt: number;
  }

  export type TaskFilter = 'all' | 'pending' | 'completed';


  export const PRIORITY_COLORS: Record<Task['priority'] & string, string> = {
    low: 'text-blue-600 bg-blue-50',
    medium: 'text-yellow-600 bg-yellow-50',
    high: 'text-red-600 bg-red-50',
  };


  export const ROLE_COLORS: Record<Message['role'], string> = {
    user: 'bg-blue-100 text-blue-900',
    assistant: 'bg-gray-100 text-gray-900',
    system: 'bg-yellow-100 text-yellow-900',
  };


