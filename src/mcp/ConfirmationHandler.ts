import { ConfirmationRequest, ConfirmationResponse, ToolCallSummary } from "../types/tools";

/**
 * Pending Confirmation State
 */
interface PendingConfirmation {
    requestId: string;
    userId: string;
    code: string;
    toolCalls: ToolCallSummary[];
    timestamp: number;
    resolve: (approved: boolean) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>; 
}

/**
 * Confirmation Handler
 * 
 * Manages user confirmation for code execution:
 * - Creates confirmation requests with unique IDs
 * - Waits for user approval via WebSocket
 * - Enforces timeout (default 60 seconds)
 * - Cleans up pending requests
 */
export class ConfirmationHandler {
    private pendingConfirmations: Map<string, PendingConfirmation>;
    private defaultTimeout: number;

    constructor(defaultTimeout: number = 60000) {
        this.pendingConfirmations = new Map();
        this.defaultTimeout = defaultTimeout;
    }

    /**
     * Request user confirmation for code execution
     * @param userId - User ID
     * @param code - LLM-generated code to execute
     * @param toolCalls - List of tool calls extracted from code
     * @param sendToUser - Callback function to send confirmation request to user via WebSocket
     * @param timeout - Optional timeout in milliseconds (default: 60000)
     * @returns Promise<boolean> - Resolves to true if approved, false if rejected
     */
    async requestConfirmation(
        userId: string,
        code: string,
        toolCalls: ToolCallSummary[],
        sendToUser: (request: ConfirmationRequest) => void,
        timeout?: number
    ): Promise<boolean> {

        const requestId = this.generateRequestId();
        const timeoutMs = timeout || this.defaultTimeout;

        console.log(`[ConfirmationHandler] Creating confirmation request: ${requestId}`);
        console.log(`[ConfirmationHandler] Tools to execute: ${toolCalls.map(tc => tc.toolName).join(', ')}`);

        const request: ConfirmationRequest = {
            requestId,
            userId,
            code,
            toolCalls,
            timeout: timeoutMs,
            timestamp: Date.now(),
        };

        const confirmationPromise = new Promise<boolean>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                console.log(`[ConfirmationHandler] Request ${requestId} timed out after ${timeoutMs}ms`);
                this.pendingConfirmations.delete(requestId);
                resolve(false); 
        }, timeoutMs);
        
        this.pendingConfirmations.set(requestId, {
          requestId,
          userId,
          code,
          toolCalls,
          timestamp: Date.now(),
          resolve,
          reject,
          timeoutId,
        });
      });

      try {
        sendToUser(request);
        console.log(`[ConfirmationHandler] Sent confirmation request to user: ${userId}`);
      } catch (error) {
        console.error(`[ConfirmationHandler] Failed to send confirmation request:`, error);
        this.cancelConfirmation(requestId);
        return false;
      }

      const approved = await confirmationPromise;

      console.log(`[ConfirmationHandler] Request ${requestId} ${approved ? 'APPROVED' : 'REJECTED'}`);
      return approved;
    }

    /**
     * Handle confirmation response from user
     * 
     * @param response - User's confirmation response
     * @returns boolean - true if response was processed, false if request not found
     */
    handleConfirmationResponse(response: ConfirmationResponse): boolean {
      const pending = this.pendingConfirmations.get(response.requestId);

      if (!pending) {
        console.warn(`[ConfirmationHandler] Confirmation response for unknown request: ${response.requestId}`);
        return false;
      }

      console.log(`[ConfirmationHandler] Processing response for ${response.requestId}: ${response.approved ? 'APPROVED' : 'REJECTED'}`);

     
      clearTimeout(pending.timeoutId);

      
      pending.resolve(response.approved);

      
      this.pendingConfirmations.delete(response.requestId);

      return true;
    }
    
    /**
     * Cancel a pending confirmation request
     * 
     * @param requestId - Request ID to cancel
     */
    cancelConfirmation(requestId: string): void {
      const pending = this.pendingConfirmations.get(requestId);

      if (pending) {
        console.log(`[ConfirmationHandler] Cancelling request: ${requestId}`);
        clearTimeout(pending.timeoutId);
        pending.resolve(false); // Reject on cancel
        this.pendingConfirmations.delete(requestId);
      }
    }

    /**
     * Get pending confirmation by request ID
     * 
     * @param requestId - Request ID
     * @returns Pending confirmation or undefined
     */
    getPendingConfirmation(requestId: string): PendingConfirmation | undefined {
      return this.pendingConfirmations.get(requestId);
    }

    /**
     * Get all pending confirmations for a user
     * 
     * @param userId - User ID
     * @returns Array of pending confirmations
     */
    getUserPendingConfirmations(userId: string): PendingConfirmation[] {
      const results: PendingConfirmation[] = [];

      for (const pending of this.pendingConfirmations.values()) {
        if (pending.userId === userId) {
          results.push(pending);
        }
      }

      return results;
    }

    /**
     * Cancel all pending confirmations for a user
     * 
     * @param userId - User ID
     */
    cancelUserConfirmations(userId: string): void {
      console.log(`[ConfirmationHandler] Cancelling all confirmations for user: ${userId}`);

      const userConfirmations = this.getUserPendingConfirmations(userId);

      for (const pending of userConfirmations) {
        this.cancelConfirmation(pending.requestId);
      }
    }

    /**
     * Get count of pending confirmations
     * 
     * @returns Number of pending confirmations
     */
    getPendingCount(): number {
      return this.pendingConfirmations.size;
    }

    /**
     * Generate unique request ID
     */
    private generateRequestId(): string {
      return `confirm-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    }

    /**
     * Clean up old pending confirmations (garbage collection)
     * Call this periodically to prevent memory leaks
     * 
     * @param maxAge - Maximum age in milliseconds (default: 5 minutes)
     */
    cleanupOldConfirmations(maxAge: number = 300000): void {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [requestId, pending] of this.pendingConfirmations.entries()) {
        if (now - pending.timestamp > maxAge) {
          console.log(`[ConfirmationHandler] Cleaning up old request: ${requestId}`);
          this.cancelConfirmation(requestId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`[ConfirmationHandler] Cleaned up ${cleanedCount} old confirmation(s)`);
      }
    }
  }

  /**
   * Helper function to create a ConfirmationHandler instance
   */
  export function createConfirmationHandler(timeout?: number): ConfirmationHandler {
    return new ConfirmationHandler(timeout);
  }