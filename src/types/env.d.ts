export interface Env {
    AI: Ai;
    // AI_GATEWAY: any;

    AGENT: DurableObjectNamespace;
    DB: D1Database;

    VECTORIZE: VectorizeIndex;
    TASK_WORKFLOW: Workflow<TaskWorkflowParams>;

    ENVIRONMENT?: string;
}

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

export interface UserPreferences { 
    name?: string;
    timezone?: string;
    preferences?: Record<string, any>;
}

export interface WSMessage {
    type: 'chat' | 'task' | 'status' | 'error';
    payload: any;
    timestamp: number; 
}

export interface AgentState {
    userId: string;
    conversationHistory: Message[];
    activeWebSockets: number;
    lastActivity: number;
}

export interface TaskWorkflowParams {
    userId: string;
    taskId: string;
    action: 'reminder' | 'decompose' | 'schedule' | 'cleanup';
    dueDate?: number;
    taskDetails?: {
        title: string;
        description?: string;
        priority?: 'low' | 'medium' | 'high';
    };
}

export interface WorkflowStepResult {
    success: boolean;
    message: string;
    data?: any;
    error?: string;
}

export interface ReminderResult extends WorkflowStepResult {
    reminderSent?: boolean;
    scheduledFor?: number;
    taskId?: string;
}



