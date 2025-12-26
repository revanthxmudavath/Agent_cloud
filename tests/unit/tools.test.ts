import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockEnv } from '../setup';
import type { ToolContext } from '../../src/types/tools';

// Import all tools
import { createTaskTool, listTasksTool, updateTaskTool, completeTaskTool, deleteTaskTool } from '../../src/mcp/tools/TaskTools';
import { getWeatherTool } from '../../src/mcp/tools/WeatherTool';
import { sendEmailTool } from '../../src/mcp/tools/EmailTool';

/**
 * Comprehensive MCP Tools Test Suite
 * Tests all 7 tools: 5 task operations + weather + email
 */

describe('MCP Tools - Task Operations', () => {
  let mockContext: ToolContext;
  let mockAgent: any;

  beforeEach(() => {
    // Reset mocks before each test
    mockAgent = {
      createTask: vi.fn(),
      listUserTasks: vi.fn(),
      updateTask: vi.fn(),
      completeTask: vi.fn(),
      deleteTask: vi.fn(),
      checkRateLimit: vi.fn(),
      recordRateLimitCall: vi.fn(),
    };

    mockContext = {
      userId: 'test-user-123',
      env: createMockEnv(),
      agent: mockAgent,
    };
  });

  // ========================================
  // CREATE TASK TOOL
  // ========================================

  describe('createTaskTool', () => {
    it('should create task successfully with all parameters', async () => {
      const mockTask = {
        id: 'task-123',
        title: 'Buy groceries',
        description: 'Milk, eggs, bread',
        dueDate: 1735689600000,
        priority: 'high',
        completed: false,
        createdAt: Date.now(),
      };

      mockAgent.createTask.mockResolvedValue(mockTask);

      const result = await createTaskTool.execute(
        {
          title: 'Buy groceries',
          description: 'Milk, eggs, bread',
          dueDate: 1735689600000,
          priority: 'high',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTask);
      expect(result.message).toBe('Task "Buy groceries" created successfully');
      expect(mockAgent.createTask).toHaveBeenCalledWith(
        'test-user-123',
        'Buy groceries',
        'Milk, eggs, bread',
        1735689600000,
        'high'
      );
    });

    it('should create task with minimal parameters (defaults to medium priority)', async () => {
      const mockTask = {
        id: 'task-456',
        title: 'Simple task',
        priority: 'medium',
        completed: false,
      };

      mockAgent.createTask.mockResolvedValue(mockTask);

      const result = await createTaskTool.execute(
        {
          title: 'Simple task',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(mockAgent.createTask).toHaveBeenCalledWith(
        'test-user-123',
        'Simple task',
        undefined,
        undefined,
        'medium'
      );
    });

    it('should validate empty title with Zod schema', () => {
      const result = createTaskTool.parameters.safeParse({
        title: '',
      });

      expect(result.success).toBe(false);
    });

    it('should validate title too long with Zod schema', () => {
      const longTitle = 'a'.repeat(201); // Max is 200

      const result = createTaskTool.parameters.safeParse({
        title: longTitle,
      });

      expect(result.success).toBe(false);
    });

    it('should validate invalid priority with Zod schema', () => {
      const result = createTaskTool.parameters.safeParse({
        title: 'Test task',
        priority: 'urgent', // Invalid priority
      });

      expect(result.success).toBe(false);
    });

    it('should handle agent error during task creation', async () => {
      mockAgent.createTask.mockRejectedValue(new Error('Database error'));

      const result = await createTaskTool.execute(
        {
          title: 'Test task',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });

    it('should validate and convert date string to timestamp with Zod schema', () => {
      const result = createTaskTool.parameters.safeParse({
        title: 'Meeting',
        dueDate: '2025-01-01T00:00:00Z',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dueDate).toEqual(expect.any(Number));
        expect(result.data.dueDate).toBeGreaterThan(0);
      }
    });
  });

  // ========================================
  // LIST TASKS TOOL
  // ========================================

  describe('listTasksTool', () => {
    it('should list all tasks without filter', async () => {
      const mockTasks = [
        { id: '1', title: 'Task 1', completed: false },
        { id: '2', title: 'Task 2', completed: true },
        { id: '3', title: 'Task 3', completed: false },
      ];

      mockAgent.listUserTasks.mockResolvedValue(mockTasks);

      const result = await listTasksTool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTasks);
      expect(result.message).toBe('Found 3 task(s)');
      expect(mockAgent.listUserTasks).toHaveBeenCalledWith('test-user-123', undefined);
    });

    it('should list only completed tasks', async () => {
      const mockTasks = [
        { id: '2', title: 'Task 2', completed: true },
      ];

      mockAgent.listUserTasks.mockResolvedValue(mockTasks);

      const result = await listTasksTool.execute(
        { completed: true },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTasks);
      expect(result.message).toBe('Found 1 task(s)');
      expect(mockAgent.listUserTasks).toHaveBeenCalledWith('test-user-123', true);
    });

    it('should list only pending tasks', async () => {
      const mockTasks = [
        { id: '1', title: 'Task 1', completed: false },
        { id: '3', title: 'Task 3', completed: false },
      ];

      mockAgent.listUserTasks.mockResolvedValue(mockTasks);

      const result = await listTasksTool.execute(
        { completed: false },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTasks);
      expect(result.message).toBe('Found 2 task(s)');
    });

    it('should return empty array when no tasks found', async () => {
      mockAgent.listUserTasks.mockResolvedValue([]);

      const result = await listTasksTool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.message).toBe('Found 0 task(s)');
    });

    it('should handle agent error during listing', async () => {
      mockAgent.listUserTasks.mockRejectedValue(new Error('Query failed'));

      const result = await listTasksTool.execute({}, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Query failed');
    });
  });

  // ========================================
  // UPDATE TASK TOOL
  // ========================================

  describe('updateTaskTool', () => {
    const validTaskId = '123e4567-e89b-12d3-a456-426614174000';

    it('should update task title successfully', async () => {
      const mockTask = {
        id: validTaskId,
        title: 'Updated title',
        completed: false,
      };

      mockAgent.updateTask.mockResolvedValue(mockTask);

      const result = await updateTaskTool.execute(
        {
          taskId: validTaskId,
          title: 'Updated title',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTask);
      expect(result.message).toBe('Task updated successfully');
      expect(mockAgent.updateTask).toHaveBeenCalledWith(
        'test-user-123',
        validTaskId,
        { title: 'Updated title' }
      );
    });

    it('should update multiple task fields', async () => {
      const mockTask = {
        id: validTaskId,
        title: 'New title',
        description: 'New description',
        priority: 'high',
        dueDate: 1735689600000,
      };

      mockAgent.updateTask.mockResolvedValue(mockTask);

      const result = await updateTaskTool.execute(
        {
          taskId: validTaskId,
          title: 'New title',
          description: 'New description',
          priority: 'high',
          dueDate: 1735689600000,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(mockAgent.updateTask).toHaveBeenCalledWith(
        'test-user-123',
        validTaskId,
        {
          title: 'New title',
          description: 'New description',
          priority: 'high',
          dueDate: 1735689600000,
        }
      );
    });

    it('should validate invalid UUID with Zod schema', () => {
      const result = updateTaskTool.parameters.safeParse({
        taskId: 'not-a-uuid',
        title: 'New title',
      });

      expect(result.success).toBe(false);
    });

    it('should validate empty title with Zod schema', () => {
      const result = updateTaskTool.parameters.safeParse({
        taskId: validTaskId,
        title: '',
      });

      expect(result.success).toBe(false);
    });

    it('should validate title too long with Zod schema', () => {
      const result = updateTaskTool.parameters.safeParse({
        taskId: validTaskId,
        title: 'a'.repeat(201),
      });

      expect(result.success).toBe(false);
    });

    it('should handle agent error - task not found', async () => {
      mockAgent.updateTask.mockRejectedValue(new Error('Task not found'));

      const result = await updateTaskTool.execute(
        {
          taskId: validTaskId,
          title: 'New title',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task not found');
    });
  });

  // ========================================
  // COMPLETE TASK TOOL
  // ========================================

  describe('completeTaskTool', () => {
    const validTaskId = '123e4567-e89b-12d3-a456-426614174000';

    it('should mark task as completed successfully', async () => {
      const mockTask = {
        id: validTaskId,
        title: 'Test task',
        completed: true,
        completedAt: Date.now(),
      };

      mockAgent.completeTask.mockResolvedValue(mockTask);

      const result = await completeTaskTool.execute(
        { taskId: validTaskId },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTask);
      expect(result.message).toBe('Task marked as completed');
      expect(mockAgent.completeTask).toHaveBeenCalledWith('test-user-123', validTaskId);
    });

    it('should validate invalid UUID with Zod schema', () => {
      const result = completeTaskTool.parameters.safeParse({
        taskId: 'invalid-uuid',
      });

      expect(result.success).toBe(false);
    });

    it('should handle agent error - task not found', async () => {
      mockAgent.completeTask.mockRejectedValue(new Error('Task not found'));

      const result = await completeTaskTool.execute(
        { taskId: validTaskId },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task not found');
    });

    it('should handle agent error - task already completed', async () => {
      mockAgent.completeTask.mockRejectedValue(new Error('Task already completed'));

      const result = await completeTaskTool.execute(
        { taskId: validTaskId },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task already completed');
    });
  });

  // ========================================
  // DELETE TASK TOOL
  // ========================================

  describe('deleteTaskTool', () => {
    const validTaskId = '123e4567-e89b-12d3-a456-426614174000';

    it('should delete task successfully', async () => {
      mockAgent.deleteTask.mockResolvedValue(undefined);

      const result = await deleteTaskTool.execute(
        { taskId: validTaskId },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Task deleted successfully');
      expect(mockAgent.deleteTask).toHaveBeenCalledWith('test-user-123', validTaskId);
    });

    it('should validate invalid UUID with Zod schema', () => {
      const result = deleteTaskTool.parameters.safeParse({
        taskId: 'not-a-uuid',
      });

      expect(result.success).toBe(false);
    });

    it('should handle agent error - task not found', async () => {
      mockAgent.deleteTask.mockRejectedValue(new Error('Task not found'));

      const result = await deleteTaskTool.execute(
        { taskId: validTaskId },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task not found');
    });

    it('should handle generic agent error', async () => {
      mockAgent.deleteTask.mockRejectedValue(new Error('Database connection lost'));

      const result = await deleteTaskTool.execute(
        { taskId: validTaskId },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection lost');
    });
  });
});

// ========================================
// WEATHER TOOL
// ========================================

describe('MCP Tools - Weather Integration', () => {
  let mockContext: ToolContext;
  let mockAgent: any;
  let mockFetch: any;

  beforeEach(() => {
    mockAgent = {
      checkRateLimit: vi.fn().mockReturnValue(true),
      recordRateLimitCall: vi.fn(),
    };

    mockContext = {
      userId: 'test-user-123',
      env: createMockEnv({
        OPENWEATHER_API_KEY: 'test-weather-key',
      }),
      agent: mockAgent,
    };

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  describe('getWeatherTool', () => {
    it('should fetch weather successfully with city only', async () => {
      const mockWeatherResponse = {
        name: 'London',
        sys: { country: 'GB' },
        main: { temp: 15.5, feels_like: 14.2, humidity: 72 },
        weather: [{ description: 'cloudy' }],
        wind: { speed: 3.5 },
        dt: 1735689600,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockWeatherResponse,
      });

      const result = await getWeatherTool.execute(
        { city: 'London' },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        city: 'London',
        country: 'GB',
        temperature: 16, // Rounded from 15.5
        feelsLike: 14,
        humidity: 72,
        description: 'cloudy',
        windSpeed: 3.5,
        timestamp: 1735689600,
      });
      expect(result.message).toBe('Weather in London, GB');
      expect(mockAgent.recordRateLimitCall).toHaveBeenCalledWith('test-user-123', 'weather');
    });

    it('should fetch weather with city and country code', async () => {
      const mockWeatherResponse = {
        name: 'Paris',
        sys: { country: 'FR' },
        main: { temp: 18.7, feels_like: 17.3, humidity: 65 },
        weather: [{ description: 'sunny' }],
        wind: { speed: 2.1 },
        dt: 1735689700,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockWeatherResponse,
      });

      const result = await getWeatherTool.execute(
        { city: 'Paris', countryCode: 'FR' },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data.city).toBe('Paris');
      expect(result.data.country).toBe('FR');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('q=Paris%2CFR')
      );
    });

    it('should handle missing API key', async () => {
      mockContext.env.OPENWEATHER_API_KEY = undefined;

      const result = await getWeatherTool.execute(
        { city: 'London' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('OpenWeatherMap API key not configured');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle rate limit exceeded', async () => {
      mockAgent.checkRateLimit.mockReturnValue(false);

      const result = await getWeatherTool.execute(
        { city: 'London' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle API error - city not found (404)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: 'city not found' }),
      });

      const result = await getWeatherTool.execute(
        { city: 'InvalidCity123' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('city not found');
    });

    it('should handle API error - generic error (500)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      const result = await getWeatherTool.execute(
        { city: 'London' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Weather API error: 500');
    });

    it('should handle malformed API response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const result = await getWeatherTool.execute(
        { city: 'London' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Weather API error: 500');
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const result = await getWeatherTool.execute(
        { city: 'London' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
    });

    it('should validate city parameter - empty string', async () => {
      const result = await getWeatherTool.execute(
        { city: '' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should validate country code - invalid length', async () => {
      const result = await getWeatherTool.execute(
        { city: 'London', countryCode: 'GBR' }, // Should be 2 chars
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should properly encode city names with special characters', async () => {
      const mockWeatherResponse = {
        name: 'São Paulo',
        sys: { country: 'BR' },
        main: { temp: 25, feels_like: 26, humidity: 80 },
        weather: [{ description: 'rainy' }],
        wind: { speed: 4.5 },
        dt: 1735689800,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockWeatherResponse,
      });

      await getWeatherTool.execute(
        { city: 'São Paulo' },
        mockContext
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('S%C3%A3o%20Paulo')
      );
    });
  });
});

// ========================================
// EMAIL TOOL
// ========================================

describe('MCP Tools - Email Integration', () => {
  let mockContext: ToolContext;
  let mockAgent: any;
  let mockFetch: any;

  beforeEach(() => {
    mockAgent = {
      checkRateLimit: vi.fn().mockReturnValue(true),
      recordRateLimitCall: vi.fn(),
    };

    mockContext = {
      userId: 'test-user-123',
      env: createMockEnv({
        POSTMARK_API_KEY: 'test-postmark-key',
        POSTMARK_FROM_EMAIL: 'sender@example.com',
      }),
      agent: mockAgent,
    };

    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  describe('sendEmailTool', () => {
    it('should send email successfully with text body only', async () => {
      const mockEmailResponse = {
        MessageID: 'msg-123-abc',
        To: 'recipient@example.com',
        SubmittedAt: '2025-01-01T12:00:00Z',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockEmailResponse,
      });

      const result = await sendEmailTool.execute(
        {
          to: 'recipient@example.com',
          subject: 'Test Email',
          textBody: 'This is a test email.',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        messageId: 'msg-123-abc',
        to: 'recipient@example.com',
        submittedAt: '2025-01-01T12:00:00Z',
      });
      expect(result.message).toBe('Email sent to recipient@example.com');
      expect(mockAgent.recordRateLimitCall).toHaveBeenCalledWith('test-user-123', 'email');

      // Verify fetch was called with correct parameters
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.postmarkapp.com/email',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Postmark-Server-Token': 'test-postmark-key',
          }),
        })
      );
    });

    it('should send email with HTML body (sanitized)', async () => {
      const mockEmailResponse = {
        MessageID: 'msg-456-def',
        To: 'recipient@example.com',
        SubmittedAt: '2025-01-01T12:05:00Z',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockEmailResponse,
      });

      const result = await sendEmailTool.execute(
        {
          to: 'recipient@example.com',
          subject: 'HTML Email',
          textBody: 'Plain text version',
          htmlBody: '<p>HTML <script>alert("xss")</script> version</p>',
        },
        mockContext
      );

      expect(result.success).toBe(true);

      // Verify HTML was sanitized (tags stripped)
      const fetchCall = mockFetch.mock.calls[0][1];
      const body = JSON.parse(fetchCall.body);
      expect(body.HtmlBody).toBe('HTML alert("xss") version'); // Tags removed
    });

    it('should handle missing API credentials', async () => {
      mockContext.env.POSTMARK_API_KEY = undefined;

      const result = await sendEmailTool.execute(
        {
          to: 'recipient@example.com',
          subject: 'Test',
          textBody: 'Test body',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('PostMark API credentials not configured');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle missing from email', async () => {
      mockContext.env.POSTMARK_FROM_EMAIL = undefined;

      const result = await sendEmailTool.execute(
        {
          to: 'recipient@example.com',
          subject: 'Test',
          textBody: 'Test body',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('PostMark API credentials not configured');
    });

    it('should handle rate limit exceeded', async () => {
      mockAgent.checkRateLimit.mockReturnValue(false);

      const result = await sendEmailTool.execute(
        {
          to: 'recipient@example.com',
          subject: 'Test',
          textBody: 'Test body',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should validate email address format', async () => {
      const result = await sendEmailTool.execute(
        {
          to: 'invalid-email',
          subject: 'Test',
          textBody: 'Test body',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should validate subject length - too long', async () => {
      const longSubject = 'a'.repeat(201); // Max is 200

      const result = await sendEmailTool.execute(
        {
          to: 'recipient@example.com',
          subject: longSubject,
          textBody: 'Test body',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email subject too long (max 200 characters)');
    });

    it('should validate subject - not empty', async () => {
      const result = await sendEmailTool.execute(
        {
          to: 'recipient@example.com',
          subject: '',
          textBody: 'Test body',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should validate text body length - too long', async () => {
      const longBody = 'a'.repeat(10 * 1024 + 1); // Max is 10KB

      const result = await sendEmailTool.execute(
        {
          to: 'recipient@example.com',
          subject: 'Test',
          textBody: longBody,
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Email body too long');
    });

    it('should validate HTML body length - too long', async () => {
      const longHtmlBody = 'a'.repeat(10 * 1024 + 1);

      const result = await sendEmailTool.execute(
        {
          to: 'recipient@example.com',
          subject: 'Test',
          textBody: 'Short text',
          htmlBody: longHtmlBody,
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Email HTML body too long');
    });

    it('should handle API error - invalid recipient', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ Message: 'Invalid recipient email address' }),
      });

      const result = await sendEmailTool.execute(
        {
          to: 'recipient@example.com',
          subject: 'Test',
          textBody: 'Test body',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid recipient email address');
    });

    it('should handle API error - generic error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      const result = await sendEmailTool.execute(
        {
          to: 'recipient@example.com',
          subject: 'Test',
          textBody: 'Test body',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Email API error: 500');
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await sendEmailTool.execute(
        {
          to: 'recipient@example.com',
          subject: 'Test',
          textBody: 'Test body',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection refused');
    });

    it('should strip all HTML tags from htmlBody for security', async () => {
      const mockEmailResponse = {
        MessageID: 'msg-789',
        To: 'recipient@example.com',
        SubmittedAt: '2025-01-01T12:10:00Z',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockEmailResponse,
      });

      await sendEmailTool.execute(
        {
          to: 'recipient@example.com',
          subject: 'Security Test',
          textBody: 'Plain text',
          htmlBody: '<div><h1>Title</h1><script>malicious()</script><p>Content</p></div>',
        },
        mockContext
      );

      const fetchCall = mockFetch.mock.calls[0][1];
      const body = JSON.parse(fetchCall.body);

      // All HTML tags should be stripped
      expect(body.HtmlBody).toBe('Titlemalicious()Content');
      expect(body.HtmlBody).not.toContain('<');
      expect(body.HtmlBody).not.toContain('>');
    });

    it('should handle valid email at maximum subject length', async () => {
      const mockEmailResponse = {
        MessageID: 'msg-999',
        To: 'recipient@example.com',
        SubmittedAt: '2025-01-01T12:15:00Z',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockEmailResponse,
      });

      const maxSubject = 'a'.repeat(200); // Exactly 200 chars

      const result = await sendEmailTool.execute(
        {
          to: 'recipient@example.com',
          subject: maxSubject,
          textBody: 'Test body',
        },
        mockContext
      );

      expect(result.success).toBe(true);
    });

    it('should handle valid email at maximum body length', async () => {
      const mockEmailResponse = {
        MessageID: 'msg-1000',
        To: 'recipient@example.com',
        SubmittedAt: '2025-01-01T12:20:00Z',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockEmailResponse,
      });

      const maxBody = 'a'.repeat(10 * 1024); // Exactly 10KB

      const result = await sendEmailTool.execute(
        {
          to: 'recipient@example.com',
          subject: 'Large email',
          textBody: maxBody,
        },
        mockContext
      );

      expect(result.success).toBe(true);
    });
  });
});
