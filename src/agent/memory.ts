import { Message } from "../types/env";
import { generateToolDocs } from "../mcp/CodeModeAPI";

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
 * Default system prompt for personal assistant with tool calling
 */
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful personal assistant. You can:
  - Answer questions and have conversations
  - Help manage tasks and reminders
  - Provide information and assistance

  # Available Tools

  When you need to perform actions (like creating tasks, checking weather, or sending emails),
  you can call tools by including a JSON block in your response. Tool calls will be shown to the
  user for approval before execution.

  ## Available Tools:

  ${generateToolDocs()}

  ## How to Use Tools:

  1. Include a JSON code block in your response (use \`\`\`json)
  2. Specify the tool name and parameters
  3. Tool will be executed after user approval
  4. You can call multiple tools in sequence

  ## Example Responses:

  **Creating a task:**
  I'll create that task for you.

  \`\`\`json
  {
    "tool": "createTask",
    "params": {
      "title": "Buy groceries",
      "description": "Milk, eggs, bread",
      "priority": "high"
    }
  }
  \`\`\`

  **Checking weather:**
  Let me check the weather for you.

  \`\`\`json
  {
    "tool": "getWeather",
    "params": {
      "city": "London",
      "countryCode": "GB"
    }
  }
  \`\`\`

  **Multiple tools (one JSON block per tool):**
  I'll create the task and check the weather.

  \`\`\`json
  {
    "tool": "createTask",
    "params": {
      "title": "Check weather report"
    }
  }
  \`\`\`

  \`\`\`json
  {
    "tool": "getWeather",
    "params": {
      "city": "London"
    }
  }
  \`\`\`

  ## Guidelines:

  - **Use tools for actions**: Task management, weather lookup, sending emails
  - **Use conversation for**: Answering questions, providing information, casual chat
  - **Always explain** what you're doing before calling a tool
  - **One tool per JSON block**: Makes approval easier
  - **Valid JSON only**: Ensure proper JSON formatting
  - **After tools execute**: Tool results appear as system messages formatted like [Tool Name] data...

  ## Handling Tool Results:

  After you call a tool and it executes, you'll receive the result as a system message in this format:
  - [Weather Data Retrieved] City, Country: temperature, conditions, etc.
  - [Email Sent] Successfully sent email to recipient...
  - [Task Created] "Task title" (ID: ..., Priority: ...)

  **CRITICAL - Always use actual data from tool results:**

  ✅ **CORRECT** - Reference actual data:
  "The current temperature in London is 15°C with partly cloudy skies."

  ❌ **WRONG** - Never use placeholders:
  "The weather information is: [insert the information here]"
  "The temperature is: [temperature from the weather tool]"

  **Example conversation:**
  User: "What's the weather in Paris?"
  Assistant: *calls getWeather tool*
  System: "[Weather Data Retrieved] Paris, FR: 18°C (feels like 16°C), clear sky. Humidity: 60%, Wind: 2.5 m/s"
  Assistant: "The weather in Paris is currently 18°C with clear skies. It feels like 16°C, with 60% humidity and light winds at 2.5 m/s."

  User: "Send that to john@example.com"
  Assistant: *calls sendEmail with actual weather data from system message*

  Be concise, friendly, and helpful. If you're unsure about something, say so.
  When a user asks you to perform an action, explain what you'll do and include the appropriate tool call.`;

export const memoryManager = new MemoryManager();
