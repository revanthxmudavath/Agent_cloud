import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { Env, TaskWorkflowParams, ReminderResult, Task } from '../types/env';

/**
   * TaskWorkflow - Multi-step task orchestration using Cloudflare Workflows
   * 
   * Features:
   * - Task reminder scheduling with automatic notifications
   * - Multi-step task decomposition
   * - Periodic task cleanup
   * - Reliable execution with automatic retries
   * - State persistence between steps
   * 
   * Usage:
   * - Triggered from PersonalAssistant when tasks are created with due dates
   * - Each step is retried automatically on failure
   * - Workflow state survives Durable Object hibernation
   */
export class TaskWorkflow extends WorkflowEntrypoint<Env, TaskWorkflowParams> {
    async run(
        event: WorkflowEvent<TaskWorkflowParams>,
        step: WorkflowStep 
    ): Promise<ReminderResult> {

        const params = event.payload;
        console.log(`[TaskWorkflow] Starting workflow for action: ${params.action}`);
        console.log(`[TaskWorkflow] Task ID: ${params.taskId}, User ID: ${params.userId}`);

        switch (params.action) {
            case 'reminder':
            return await this.handleReminderWorkflow(params, step);

            case 'decompose':
            return await this.handleDecomposeWorkflow(params, step);

            case 'schedule':
            return await this.handleScheduleWorkflow(params, step);

            case 'cleanup':
            return await this.handleCleanupWorkflow(params, step);

            default:
            console.error(`[TaskWorkflow] Unknown action: ${params.action}`);
            return {
                success: false,
                message: `Unknown workflow action: ${params.action}`,
                error: 'INVALID_ACTION',
            };
      }
        
    }

     /**
     * WORKFLOW 1: Task Reminder
     * 
     * Steps:
     * 1. Verify task still exists and is not completed
     * 2. Calculate reminder time (1 day before due date)
     * 3. Sleep until reminder time
     * 4. Send reminder notification (via D1 or future WebSocket)
     * 5. Mark reminder as sent
     */
    private async handleReminderWorkflow(
        params: TaskWorkflowParams,
        step: WorkflowStep
    ): Promise<ReminderResult> {

        const task = await step.do("verify-task", async () => {
            console.log(`[TaskWorkflow] Verifying task ID: ${params.taskId}`);

            const result = await this.env.DB.prepare(
                'SELECT * FROM tasks WHERE id = ? AND user_id = ?'
            ).bind(params.taskId, params.userId).first();

            if(!result) {
                throw new Error('Task not found');
            }

            return {
                id: result.id as string,
                userId: result.user_id as string,
                title: result.title as string,
                description: result.description as string | undefined,
                dueDate: result.due_date as number | undefined,
                completed: Boolean(result.completed),
                priority: (result.priority as 'low' | 'medium' | 'high') || 'medium',
                createdAt: result.created_at as number,
            };

        });

        if(task.completed) {
            console.log(`[TaskWorkflow] Task ${params.taskId} already completed, skipping reminder`);
        return {
          success: true,
          message: 'Task already completed, reminder skipped',
          reminderSent: false,
          taskId: params.taskId,
        };
      }

    const reminderTime = await step.do('calculate-reminder-time', async () => {

        console.log(`[TaskWorkflow] Calculating reminder time for task ID: ${params.taskId}`);

        const dueDate = params.dueDate || task.dueDate;
        if (!dueDate) {
            throw new Error('No due date set for task');
        }

        const reminderTimestamp = dueDate - (24 * 60 * 60) 
        const now = Math.floor(Date.now() / 1000);

        return {
            reminderTimestamp,
            dueDate,
            shouldSendNow: reminderTimestamp <= now,
            timeUntilReminder: Math.max( 0, reminderTimestamp - now)
        };
      });

      if(!reminderTime.shouldSendNow && reminderTime.timeUntilReminder > 0) {
        await step.sleep('wait-for-reminder-time', reminderTime.timeUntilReminder * 1000);
        console.log(`[TaskWorkflow] Woke up after ${reminderTime.timeUntilReminder} s sleep`);
      }

      const taskStillIncomplete = await step.do('recheck-task-status', async () => {
        console.log(`[TaskWorkflow] Rechecking task status before sending reminder`);
        const result = await this.env.DB.prepare(
            'SELECT completed FROM tasks WHERE id = ? AND user_id = ?'
        ).bind(params.taskId, params.userId).first();
        
        if (!result) {
            return false; 
        }

        return !Boolean(result.completed);
    });

    if (!taskStillIncomplete) {
        console.log(`[TaskWorkflow] Task ${params.taskId} completed or deleted, skipping reminder`);
        return {
          success: true,
          message: 'Task completed or deleted before reminder time',
          reminderSent: false,
          taskId: params.taskId,
        };
    }

    const reminderSent = await step.do('send-reminder', async () => {
        console.log(`[TaskWorkflow] Sending reminder for task title: ${task.title}`);

        const reminderMessage = `Reminder: Task "${task.title}" is due in 24 hours (Priority: ${task.priority})`
        const messageId = crypto.randomUUID();

        const now = Math.floor(Date.now() / 1000);

        await this.env.DB.prepare(
            'INSERT INTO conversations (id, user_id, role, content, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(
          messageId,
          params.userId,
          'system',
          reminderMessage,
          now,
          JSON.stringify({ type: 'task_reminder', taskId: params.taskId })
        ).run();

        console.log(`[TaskWorkflow] Reminder message stored with ID: ${messageId}`);
        return true;
    });

    return {
        success: true,
        message: `Reminder sent for task: ${task.title}`,
        reminderSent,
        scheduledFor: reminderTime.reminderTimestamp,
        taskId: params.taskId,
        data: {
            taskTitle: task.title,
            dueDate: reminderTime.dueDate
        },
    };
}

/**
 * Workflow 2: Task Decomposition
 *  * Future enhancement: Use Workers AI to break down complex tasks into subtasks
     * For now, this is a placeholder implementation
 */
private async handleDecomposeWorkflow(
    params: TaskWorkflowParams,
    step: WorkflowStep
): Promise<ReminderResult> {

    const decomposed = await step.do('decompose-task', async () => {
        console.log(`[TaskWorkflow] Decomposing task ${params.taskId}`);

        // TODO Phase 3: Use Workers AI to analyze task and create subtasks
        // For now, just log the action
        return {
          subtasksCreated: 0,
          message: 'Task decomposition not yet implemented (Phase 3)',
        };
    });

    return {
        success: true,
        message: decomposed.message,
        data: decomposed,
    };
}

/**
 * WORKFLOW 3: Scheduled Task Execution
 * 
 * Future enhancement: Execute tasks at specific times
 */
private async handleScheduleWorkflow(
    params: TaskWorkflowParams,
    step: WorkflowStep
): Promise<ReminderResult> {

    const scheduled = await step.do('schedule-task', async () => {
    console.log(`[TaskWorkflow] Scheduling task ${params.taskId}`);

    // TODO: Implement scheduled task execution
    return {
        scheduled: true,
        message: 'Scheduled execution not yet implemented',
    };
    });

    return {
    success: true,
    message: scheduled.message,
    data: scheduled,
    };
}

/**
 * Workflow 4: Cleanup Old Completed Tasks
 */
private async handleCleanupWorkflow(
    params: TaskWorkflowParams,
    step: WorkflowStep
): Promise<ReminderResult> {

    const deletedCount = await step.do('cleanup-old-tasks', async () => {
        console.log(`[TaskWorkflow] Cleaning up old completed tasks for user ${params.userId}`);

        const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);

        const result = await this.env.DB.prepare(
            'DELETE FROM tasks WHERE user_id = ? AND completed = 1 AND completed_at < ?'
        ).bind(params.userId, thirtyDaysAgo).run()

        return result.meta.changes || 0;
    });

    return {
        success: true,
        message: `Cleaned up ${deletedCount} old completed tasks`,
        data: { deletedCount },
    };
}

}