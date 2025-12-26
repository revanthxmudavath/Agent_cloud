import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryManager,
  DEFAULT_SYSTEM_PROMPT,
  type MemoryOptions,
  type ConversationContext
} from '../../src/agent/memory';
import type { Message } from '../../src/types/env';

/**
 * Comprehensive unit tests for memory management utilities
 *
 * Tests cover:
 * - Context building with message/token limits
 * - LLM message formatting
 * - Token estimation accuracy
 * - Message truncation logic
 * - RAG context preparation
 * - System prompt inclusion
 * - Edge cases (empty history, very long messages, etc.)
 */

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;

  beforeEach(() => {
    memoryManager = new MemoryManager();
  });

  /**
   * Helper: Create mock messages
   */
  const createMessage = (
    id: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    timestamp: number = Date.now()
  ): Message => ({
    id,
    role,
    content,
    timestamp,
  });

  /**
   * Helper: Create N messages with predictable content
   */
  const createMessages = (count: number, contentLength: number = 100): Message[] => {
    return Array.from({ length: count }, (_, i) =>
      createMessage(
        `msg-${i}`,
        i % 2 === 0 ? 'user' : 'assistant',
        'A'.repeat(contentLength),
        Date.now() - (count - i) * 1000 // Older messages have earlier timestamps
      )
    );
  };

  describe('buildContext()', () => {
    it('should build context from message history', () => {
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'assistant', 'Hi there!'),
        createMessage('3', 'user', 'How are you?'),
      ];

      const context = memoryManager.buildContext(messages);

      expect(context.messages).toHaveLength(3);
      expect(context.messages[0].content).toBe('Hello');
      expect(context.messages[2].content).toBe('How are you?');
      expect(context.truncated).toBe(false);
      expect(context.totalTokens).toBeGreaterThan(0);
    });

    it('should include system prompt in context', () => {
      const messages = [createMessage('1', 'user', 'Hello')];
      const systemPrompt = 'You are a helpful assistant.';

      const context = memoryManager.buildContext(messages, { systemPrompt });

      expect(context.systemPrompt).toBe(systemPrompt);
      expect(context.totalTokens).toBeGreaterThan(5); // At least system prompt tokens
    });

    it('should respect message limit (default 50)', () => {
      const messages = createMessages(100); // Create 100 messages

      const context = memoryManager.buildContext(messages);

      expect(context.messages).toHaveLength(50); // Should only keep last 50
      expect(context.messages[0].id).toBe('msg-50'); // Oldest kept message
      expect(context.messages[49].id).toBe('msg-99'); // Newest message
      expect(context.truncated).toBe(false); // Within token limits
    });

    it('should respect custom message limit', () => {
      const messages = createMessages(30);
      const options: MemoryOptions = { maxMessages: 10 };

      const context = memoryManager.buildContext(messages, options);

      expect(context.messages).toHaveLength(10);
      expect(context.messages[0].id).toBe('msg-20'); // Last 10 messages
      expect(context.messages[9].id).toBe('msg-29');
    });

    it('should respect token limit (default 4000)', () => {
      // Each message has 1000 chars = ~250 tokens
      // 20 messages = ~5000 tokens (exceeds default 4000)
      const messages = createMessages(20, 1000);

      const context = memoryManager.buildContext(messages);

      expect(context.totalTokens).toBeLessThanOrEqual(4000);
      expect(context.truncated).toBe(true);
      expect(context.messages.length).toBeLessThan(20);
    });

    it('should respect custom token limit', () => {
      const messages = createMessages(10, 500); // ~1250 tokens total
      const options: MemoryOptions = { maxTokens: 1000 };

      const context = memoryManager.buildContext(messages, options);

      expect(context.totalTokens).toBeLessThanOrEqual(1000);
      expect(context.truncated).toBe(true);
      expect(context.messages.length).toBeLessThan(10);
    });

    it('should truncate oldest messages first', () => {
      const messages = [
        createMessage('old-1', 'user', 'A'.repeat(1000), Date.now() - 3000),
        createMessage('old-2', 'assistant', 'A'.repeat(1000), Date.now() - 2000),
        createMessage('recent', 'user', 'A'.repeat(1000), Date.now() - 1000),
        createMessage('newest', 'assistant', 'A'.repeat(500), Date.now()),
      ];
      const options: MemoryOptions = { maxTokens: 500 }; // Only fits ~2 messages

      const context = memoryManager.buildContext(messages, options);

      expect(context.truncated).toBe(true);
      // Should keep newest messages
      expect(context.messages.some(m => m.id === 'newest')).toBe(true);
      // Should drop oldest messages
      expect(context.messages.some(m => m.id === 'old-1')).toBe(false);
    });

    it('should account for system prompt in token budget', () => {
      const systemPrompt = 'A'.repeat(2000); // ~500 tokens
      const messages = createMessages(10, 1500); // ~375 tokens each
      const options: MemoryOptions = {
        systemPrompt,
        maxTokens: 1000, // 500 for system + 500 for messages
      };

      const context = memoryManager.buildContext(messages, options);

      expect(context.totalTokens).toBeLessThanOrEqual(1000);
      expect(context.truncated).toBe(true);
      expect(context.messages.length).toBeLessThan(10);
    });

    it('should handle empty message history', () => {
      const context = memoryManager.buildContext([]);

      expect(context.messages).toHaveLength(0);
      expect(context.totalTokens).toBe(0);
      expect(context.truncated).toBe(false);
    });

    it('should handle single message', () => {
      const messages = [createMessage('1', 'user', 'Hello')];

      const context = memoryManager.buildContext(messages);

      expect(context.messages).toHaveLength(1);
      expect(context.messages[0].content).toBe('Hello');
      expect(context.truncated).toBe(false);
    });

    it('should handle very long single message', () => {
      const messages = [createMessage('1', 'user', 'A'.repeat(20000))]; // ~5000 tokens
      const options: MemoryOptions = { maxTokens: 4000 };

      const context = memoryManager.buildContext(messages, options);

      // Should truncate even the last message if it exceeds limit
      expect(context.totalTokens).toBeLessThanOrEqual(4000);
      expect(context.truncated).toBe(true);
      expect(context.messages).toHaveLength(0); // Cannot fit even last message
    });

    it('should preserve message order', () => {
      const messages = [
        createMessage('1', 'user', 'First'),
        createMessage('2', 'assistant', 'Second'),
        createMessage('3', 'user', 'Third'),
      ];

      const context = memoryManager.buildContext(messages);

      expect(context.messages[0].id).toBe('1');
      expect(context.messages[1].id).toBe('2');
      expect(context.messages[2].id).toBe('3');
    });

    it('should handle all message roles (user, assistant, system)', () => {
      const messages = [
        createMessage('1', 'user', 'User message'),
        createMessage('2', 'assistant', 'Assistant message'),
        createMessage('3', 'system', 'System message'),
      ];

      const context = memoryManager.buildContext(messages);

      expect(context.messages).toHaveLength(3);
      expect(context.messages[0].role).toBe('user');
      expect(context.messages[1].role).toBe('assistant');
      expect(context.messages[2].role).toBe('system');
    });
  });

  describe('formatForLLM()', () => {
    it('should format messages for LLM API', () => {
      const context: ConversationContext = {
        messages: [
          createMessage('1', 'user', 'Hello'),
          createMessage('2', 'assistant', 'Hi!'),
        ],
        totalTokens: 10,
        truncated: false,
      };

      const formatted = memoryManager.formatForLLM(context);

      expect(formatted).toHaveLength(2);
      expect(formatted[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(formatted[1]).toEqual({ role: 'assistant', content: 'Hi!' });
    });

    it('should prepend system prompt if provided', () => {
      const context: ConversationContext = {
        messages: [createMessage('1', 'user', 'Hello')],
        systemPrompt: 'You are a helpful assistant.',
        totalTokens: 10,
        truncated: false,
      };

      const formatted = memoryManager.formatForLLM(context);

      expect(formatted).toHaveLength(2);
      expect(formatted[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant.',
      });
      expect(formatted[1]).toEqual({ role: 'user', content: 'Hello' });
    });

    it('should handle empty messages', () => {
      const context: ConversationContext = {
        messages: [],
        totalTokens: 0,
        truncated: false,
      };

      const formatted = memoryManager.formatForLLM(context);

      expect(formatted).toHaveLength(0);
    });

    it('should preserve message roles', () => {
      const context: ConversationContext = {
        messages: [
          createMessage('1', 'user', 'User'),
          createMessage('2', 'assistant', 'Assistant'),
          createMessage('3', 'system', 'System'),
        ],
        totalTokens: 15,
        truncated: false,
      };

      const formatted = memoryManager.formatForLLM(context);

      expect(formatted[0].role).toBe('user');
      expect(formatted[1].role).toBe('assistant');
      expect(formatted[2].role).toBe('system');
    });
  });

  describe('Token estimation', () => {
    it('should estimate tokens correctly (4 chars/token)', () => {
      const messages = [createMessage('1', 'user', 'A'.repeat(400))]; // Should be ~100 tokens

      const context = memoryManager.buildContext(messages);

      expect(context.totalTokens).toBe(100);
    });

    it('should round up token counts', () => {
      const messages = [createMessage('1', 'user', 'ABC')]; // 3 chars = 0.75 tokens → 1 token

      const context = memoryManager.buildContext(messages);

      expect(context.totalTokens).toBe(1);
    });

    it('should handle empty content', () => {
      const messages = [createMessage('1', 'user', '')];

      const context = memoryManager.buildContext(messages);

      expect(context.totalTokens).toBe(0);
    });

    it('should accumulate tokens across multiple messages', () => {
      const messages = [
        createMessage('1', 'user', 'A'.repeat(100)),  // 25 tokens
        createMessage('2', 'assistant', 'A'.repeat(200)), // 50 tokens
        createMessage('3', 'user', 'A'.repeat(300)),  // 75 tokens
      ];

      const context = memoryManager.buildContext(messages);

      expect(context.totalTokens).toBe(150); // 25 + 50 + 75
    });
  });

  describe('prepareRAGContext()', () => {
    it('should prepare RAG-enhanced context', () => {
      const messages = createMessages(5, 200);
      const retrievedContext = [
        'Relevant information 1',
        'Relevant information 2',
      ];

      const context = memoryManager.prepareRAGContext(messages, retrievedContext);

      // Should have RAG system message prepended
      expect(context.messages[0].role).toBe('system');
      expect(context.messages[0].id).toBe('rag-context');
      expect(context.messages[0].content).toContain('Relevant context from knowledge base');
      expect(context.messages[0].content).toContain('Relevant information 1');
      expect(context.messages[0].content).toContain('Relevant information 2');
    });

    it('should allocate 70% of tokens to conversation', () => {
      const messages = createMessages(20, 1000); // Would normally use ~5000 tokens
      const retrievedContext = ['Context info'];
      const options: MemoryOptions = { maxTokens: 1000 };

      const context = memoryManager.prepareRAGContext(messages, retrievedContext, options);

      // Conversation should use only 70% = 700 tokens (before adding RAG message)
      // So conversation messages should be truncated significantly
      expect(context.messages.length).toBeLessThan(20);
      expect(context.truncated).toBe(true);
    });

    it('should handle empty retrieved context', () => {
      const messages = createMessages(3, 100);
      const retrievedContext: string[] = [];

      const context = memoryManager.prepareRAGContext(messages, retrievedContext);

      // Should not add RAG system message if no context
      expect(context.messages.every(m => m.id !== 'rag-context')).toBe(true);
      expect(context.messages).toHaveLength(3);
    });

    it('should handle empty conversation history', () => {
      const messages: Message[] = [];
      const retrievedContext = ['Some context'];

      const context = memoryManager.prepareRAGContext(messages, retrievedContext);

      // Should only have RAG system message
      expect(context.messages).toHaveLength(1);
      expect(context.messages[0].role).toBe('system');
      expect(context.messages[0].id).toBe('rag-context');
    });

    it('should respect custom max tokens', () => {
      const messages = createMessages(10, 500);
      const retrievedContext = ['Context 1', 'Context 2'];
      const options: MemoryOptions = { maxTokens: 500 };

      const context = memoryManager.prepareRAGContext(messages, retrievedContext, options);

      // 70% for conversation = 350 tokens
      // Should be significantly truncated
      expect(context.messages.length).toBeLessThan(10);
      expect(context.totalTokens).toBeLessThanOrEqual(500);
    });

    it('should format RAG context correctly', () => {
      const messages = [createMessage('1', 'user', 'Test')];
      const retrievedContext = [
        'First piece of context',
        'Second piece of context',
      ];

      const context = memoryManager.prepareRAGContext(messages, retrievedContext);

      const ragMessage = context.messages[0];
      expect(ragMessage.content).toBe(
        'Relevant context from knowledge base:\n' +
        'First piece of context\n\n' +
        'Second piece of context'
      );
    });
  });

  describe('summarizeConversation()', () => {
    it('should summarize conversation topics', async () => {
      const messages = [
        createMessage('1', 'user', 'I need help with programming'),
        createMessage('2', 'assistant', 'Sure, what language?'),
        createMessage('3', 'user', 'JavaScript and TypeScript'),
      ];

      const summary = await memoryManager.summarizeConversation(messages);

      expect(summary).toContain('2 user messages');
      expect(summary).toContain('programming');
      // Note: Summary extracts words and converts to lowercase
      expect(summary).toContain('javascript');
      expect(summary).toContain('typescript');
    });

    it('should handle empty conversation', async () => {
      const summary = await memoryManager.summarizeConversation([]);

      expect(summary).toBe('No conversation history.');
    });

    it('should only include user messages', async () => {
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'assistant', 'Hi there!'),
        createMessage('3', 'system', 'System message'),
      ];

      const summary = await memoryManager.summarizeConversation(messages);

      expect(summary).toContain('1 user messages'); // Only 1 user message
    });

    it('should extract words longer than 5 characters', async () => {
      const messages = [
        createMessage('1', 'user', 'I need a small car'), // 'small' = 5 chars (excluded)
        createMessage('2', 'user', 'Looking for vehicle'), // 'Looking' and 'vehicle' > 5
      ];

      const summary = await memoryManager.summarizeConversation(messages);

      expect(summary).toContain('looking');
      expect(summary).toContain('vehicle');
      expect(summary).not.toContain('small');
    });

    it('should limit topics to 5', async () => {
      const messages = [
        createMessage('1', 'user', 'programming JavaScript TypeScript Python database server client'),
      ];

      const summary = await memoryManager.summarizeConversation(messages);

      // Should only include first 5 topics
      const topics = summary.split('discussing: ')[1]?.split(', ') || [];
      expect(topics.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getRecentMessages()', () => {
    it('should return last N messages', () => {
      const messages = createMessages(20);

      const recent = memoryManager.getRecentMessages(messages, 5);

      expect(recent).toHaveLength(5);
      expect(recent[0].id).toBe('msg-15');
      expect(recent[4].id).toBe('msg-19');
    });

    it('should default to 10 messages', () => {
      const messages = createMessages(20);

      const recent = memoryManager.getRecentMessages(messages);

      expect(recent).toHaveLength(10);
      expect(recent[0].id).toBe('msg-10');
    });

    it('should return all messages if fewer than N', () => {
      const messages = createMessages(5);

      const recent = memoryManager.getRecentMessages(messages, 10);

      expect(recent).toHaveLength(5);
    });

    it('should handle empty array', () => {
      const recent = memoryManager.getRecentMessages([]);

      expect(recent).toHaveLength(0);
    });
  });

  describe('getMessagesByTimeRange()', () => {
    it('should filter messages by time range', () => {
      const now = Date.now();
      const messages = [
        createMessage('old', 'user', 'Old message', now - 3 * 60 * 60 * 1000), // 3 hours ago
        createMessage('recent', 'user', 'Recent message', now - 30 * 60 * 1000), // 30 mins ago
        createMessage('new', 'user', 'New message', now), // Now
      ];

      const recent = memoryManager.getMessagesByTimeRange(messages, 1); // Last 1 hour

      expect(recent).toHaveLength(2);
      expect(recent.some(m => m.id === 'recent')).toBe(true);
      expect(recent.some(m => m.id === 'new')).toBe(true);
      expect(recent.some(m => m.id === 'old')).toBe(false);
    });

    it('should handle empty array', () => {
      const recent = memoryManager.getMessagesByTimeRange([], 1);

      expect(recent).toHaveLength(0);
    });

    it('should return all messages if all within range', () => {
      const now = Date.now();
      const messages = [
        createMessage('1', 'user', 'Msg 1', now - 30 * 60 * 1000),
        createMessage('2', 'user', 'Msg 2', now - 15 * 60 * 1000),
        createMessage('3', 'user', 'Msg 3', now),
      ];

      const recent = memoryManager.getMessagesByTimeRange(messages, 2); // Last 2 hours

      expect(recent).toHaveLength(3);
    });
  });

  describe('extractIntent()', () => {
    it('should detect task intent', () => {
      const messages = [
        createMessage('1', 'user', 'Create a task for groceries'),
      ];

      const intent = memoryManager.extractIntent(messages);

      expect(intent).toBe('task');
    });

    it('should detect question intent', () => {
      const messages = [
        createMessage('1', 'user', 'What is the weather today?'),
      ];

      const intent = memoryManager.extractIntent(messages);

      expect(intent).toBe('question');
    });

    it('should detect chat intent', () => {
      const messages = [
        createMessage('1', 'user', 'Hello there! Thanks for helping me.'),
      ];

      const intent = memoryManager.extractIntent(messages);

      expect(intent).toBe('chat');
    });

    it('should return unknown for unclear intent', () => {
      const messages = [
        createMessage('1', 'user', 'Some random text'),
      ];

      const intent = memoryManager.extractIntent(messages);

      expect(intent).toBe('unknown');
    });

    it('should only analyze recent 3 messages', () => {
      const messages = [
        createMessage('1', 'user', 'Some old message'),
        createMessage('2', 'user', 'Another old message'),
        createMessage('3', 'assistant', 'Response'),
        createMessage('4', 'user', 'What is the weather today?'),
      ];

      const intent = memoryManager.extractIntent(messages);

      // Should detect 'question' from recent messages (last 3)
      // Messages 2, 3, 4 analyzed - message 1 ignored
      expect(intent).toBe('question');
    });

    it('should handle empty messages', () => {
      const intent = memoryManager.extractIntent([]);

      expect(intent).toBe('unknown');
    });

    it('should be case insensitive', () => {
      const messages = [
        createMessage('1', 'user', 'CREATE A TASK'),
      ];

      const intent = memoryManager.extractIntent(messages);

      expect(intent).toBe('task');
    });
  });

  describe('DEFAULT_SYSTEM_PROMPT', () => {
    it('should contain tool calling instructions', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('Available Tools');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('JSON');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('tool');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('params');
    });

    it('should contain example tool calls', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('createTask');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('getWeather');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('```json');
    });

    it('should contain tool result handling instructions', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('Handling Tool Results');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('[Tool Name]');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('actual data');
    });

    it('should contain guidelines', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('Guidelines');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('concise');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('helpful');
    });

    it('should be non-empty', () => {
      expect(DEFAULT_SYSTEM_PROMPT.length).toBeGreaterThan(100);
    });
  });

  describe('Edge cases and integration', () => {
    it('should handle messages with metadata', () => {
      const messages = [
        createMessage('1', 'user', 'Hello'),
      ];
      messages[0].metadata = { custom: 'data' };

      const context = memoryManager.buildContext(messages);

      expect(context.messages[0].metadata).toEqual({ custom: 'data' });
    });

    it('should handle unicode and special characters', () => {
      const messages = [
        createMessage('1', 'user', '你好 🌟 Special chars: @#$%'),
      ];

      const context = memoryManager.buildContext(messages);

      expect(context.messages[0].content).toBe('你好 🌟 Special chars: @#$%');
      expect(context.totalTokens).toBeGreaterThan(0);
    });

    it('should handle mixed message lengths', () => {
      const messages = [
        createMessage('1', 'user', 'Short'),
        createMessage('2', 'assistant', 'A'.repeat(1000)),
        createMessage('3', 'user', 'Medium length message here'),
      ];

      const context = memoryManager.buildContext(messages);

      expect(context.messages).toHaveLength(3);
      expect(context.totalTokens).toBeGreaterThan(250); // At least ~250 tokens
    });

    it('should handle rapid successive calls', () => {
      const messages = createMessages(10);

      const context1 = memoryManager.buildContext(messages);
      const context2 = memoryManager.buildContext(messages);

      expect(context1.totalTokens).toBe(context2.totalTokens);
      expect(context1.messages.length).toBe(context2.messages.length);
    });

    it('should be idempotent', () => {
      const messages = createMessages(5);

      const context1 = memoryManager.buildContext(messages);
      const formatted1 = memoryManager.formatForLLM(context1);

      const context2 = memoryManager.buildContext(messages);
      const formatted2 = memoryManager.formatForLLM(context2);

      expect(formatted1).toEqual(formatted2);
    });
  });
});
