import { Message } from "../types/env";

export interface MemoryOptions {
    maxMessages?: number;
    maxTokens?: number;
    systemPrompt?: string;
}

export interface ConversationContext {
    messages: Message[];
    systemPrompt?: string;
    totalTokens: number;
    truncated: boolean;
}
/**
 * MemoryManager utilities for conversation context
 */
export class MemoryManager {
    private readonly DEFAULT_MAX_MESSAGES = 50;
    private readonly DEFAULT_MAX_TOKENS = 4000;
    private readonly CHARS_PER_TOKEN = 4; 


    /**
     * 
     * Estimate token count for a message  
     */
    private estimateTokens(text: string): number {
        return Math.ceil(text.length / this.CHARS_PER_TOKEN)
    }

    /**
     * Build conversation context from message history
     * Truncates old messages if exceeding token/message limits
     */
    buildContext(
        messages: Message[],
        options: MemoryOptions = {}
    ): ConversationContext {
        const maxMessages = options.maxMessages || this.DEFAULT_MAX_MESSAGES;
        const maxTokens = options.maxTokens || this.DEFAULT_MAX_TOKENS;
        
        const recentMessages = messages.slice(-maxMessages);

        let totalTokens = 0;
        const contextMessages: Message[] = [];

        let truncated = false;

        if(options.systemPrompt){
            totalTokens += this.estimateTokens(options.systemPrompt);

        }

        for (let i= recentMessages.length - 1; i >= 0; i--) {
            const msg = recentMessages[i];
            const msgTokens = this.estimateTokens(msg.content);

            if (totalTokens + msgTokens > maxTokens) {
                truncated = true;
                break;
            }

            contextMessages.unshift(msg);
            totalTokens += msgTokens;
        }

        return {
            messages: contextMessages,
            systemPrompt: options.systemPrompt,
            totalTokens,
            truncated
        };
    }

    /**
     * Format Messages for LLM Prompt
     */
    formatForLLM(context: ConversationContext): Array<{ role: string, content: string }> {
        const formatted: Array<{ role: string; content: string }> = [];

        if (context.systemPrompt) {
            formatted.push({ role: 'system',
                content: context.systemPrompt
            });
        }

        // conversation messages added
        for (const msg of context.messages) {
            formatted.push({
                role: msg.role,
                content: msg.content
            });
        }

        return formatted;
    }


    /**
     * Summarize conversation history for long-term memory
     * (Placeholder - will be enhanced with LLM in Phase 3)
     */
    async summarizeConversation(messages: Message[]): Promise<string> {
        if(messages.length === 0) {
            return "No conversation history.";  
        }

        const userMessages = messages.filter(m => m.role === 'user')
        const topics = new Set<string>();

        userMessages.forEach(msg => {
            const words = msg.content.toLowerCase().split(/\s+/);
            words.forEach(word => {
                if (word.length > 5) {
                    topics.add(word);
                }
            });
        });
        return `Conversation covered ${userMessages.length} user messages discussing: ${Array.from(topics).slice(0, 5).join(', ')}`;
    }

    /**
     * Get recent messages window
     */
    getRecentMessages(messages: Message[], count: number = 10): Message[] {
        return messages.slice(-count);
    }

    /**
     * Filter messages by time range (last N hours)
     */
    getMessagesByTimeRange(messages: Message[], hours: number): Message[] {
      const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
      return messages.filter(msg => msg.timestamp >= cutoffTime);
    }

    /**
     * Extract user intents from messages
     * (Placeholder - will be enhanced with LLM in Phase 3)
     */
    extractIntent(messages: Message[]): 'task' | 'chat' | 'question' | 'unknown' {

      const recentCount = Math.min(messages.length, 3);
      const recent = this.getRecentMessages(messages, recentCount);

     
      if (recent.length === 0) {
          return 'unknown';
      }

      const recentText = recent.map(m => m.content.toLowerCase()).join(' ');

      if (recentText.includes('create') || recentText.includes('add task') || recentText.includes('remind')) {
          return 'task';
      }

      if (recentText.includes('?') || recentText.includes('what') || recentText.includes('how')) {
          return 'question';
      }

      if (recentText.includes('hello') || recentText.includes('hi') || recentText.includes('thanks')) {
          return 'chat';
      }

      return 'unknown';
  }

    /**
     * prepare context for RAG generation
     * (Placeholder - will be enhanced with vectorize integration)
     */
    prepareRAGContext(
        conversationMessages: Message[],
        retrievedContext: string[],
        options: MemoryOptions = {}
    ): ConversationContext {
        const baseContext = this.buildContext(conversationMessages, {
            ...options,
            maxTokens: (options.maxTokens || this.DEFAULT_MAX_TOKENS) * 0.7,
        });

         if (retrievedContext.length > 0) {
        const ragSystemMessage: Message = {
          id: 'rag-context',
          role: 'system',
          content: `Relevant context from knowledge base:\n${retrievedContext.join('\n\n')}`,
          timestamp: Date.now(),
        };

        baseContext.messages.unshift(ragSystemMessage);
        baseContext.totalTokens += this.estimateTokens(ragSystemMessage.content);
      }

      return baseContext;
    
    }

}

/**
 * Default system prompt for personal assistant
 */
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful personal assistant. You can:
- Answer questions and have conversations
- Help manage tasks and reminders
- Provide information and assistance

Be concise, friendly, and helpful. If you're unsure about something, say so.`;


export const memoryManager = new MemoryManager();
