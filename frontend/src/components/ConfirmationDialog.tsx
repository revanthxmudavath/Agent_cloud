import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import type { WSMessageType } from '../types/index';

interface ConfirmationDialogProps {
  sendMessage: (type: WSMessageType, payload: any) => boolean;
}

export function ConfirmationDialog({ sendMessage }: ConfirmationDialogProps) {
const pendingConfirmation = useAppStore((state) => state.pendingConfirmation);
const clearPendingConfirmation = useAppStore((state) => state.clearPendingConfirmation);

const [timeRemaining, setTimeRemaining] = useState<number>(0);

const handleReject = useCallback(() => {
    if (!pendingConfirmation) return;

    sendMessage('confirmation_response', {
    requestId: pendingConfirmation.requestId,
    approved: false,
    timestamp: Date.now(),
    });

    clearPendingConfirmation();
}, [pendingConfirmation, sendMessage, clearPendingConfirmation]);

// Calculate time remaining
useEffect(() => {
    if (!pendingConfirmation) {
    setTimeRemaining(0);
    return;
    }

    const updateTimer = () => {
    const remaining = Math.max(0, pendingConfirmation.expiresAt - Date.now());
    setTimeRemaining(remaining);

    // Auto-reject on timeout
    if (remaining <= 0) {
        handleReject();
    }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);

    return () => clearInterval(interval);
}, [pendingConfirmation, handleReject]);

const handleApprove = () => {
    if (!pendingConfirmation) return;

    sendMessage('confirmation_response', {
    requestId: pendingConfirmation.requestId,
    approved: true,
    timestamp: Date.now(),
    });

    clearPendingConfirmation();
};

// Don't render if no pending confirmation
if (!pendingConfirmation) {
    return null;
}

const secondsRemaining = Math.ceil(timeRemaining / 1000);
const isExpiringSoon = secondsRemaining <= 10;

return (
    <>
    {/* Backdrop */}
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40" />

    {/* Modal */}
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-4">
            <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-yellow-600" />
            <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900">
                Tool Execution Request
                </h2>
                <p className="text-sm text-gray-600">
                The assistant wants to execute the following tool(s)
                </p>
            </div>
            <div className={`flex items-center gap-2 text-sm font-medium ${
                isExpiringSoon ? 'text-red-600' : 'text-gray-600'
            }`}>
                <Clock className="h-4 w-4" />
                <span>{secondsRemaining}s</span>
            </div>
            </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
            {/* Tool Calls */}
            <div className="space-y-4">
            {pendingConfirmation.toolCalls.map((toolCall, index) => (
                <div
                key={index}
                className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-gray-700">
                    Tool:
                    </span>
                    <span className="text-sm font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {toolCall.toolName}
                    </span>
                </div>

                {toolCall.description && (
                    <p className="text-sm text-gray-600 mb-2">
                    {toolCall.description}
                    </p>
                )}

                <div className="mt-3">
                    <span className="text-xs font-semibold text-gray-700 mb-1 block">
                    Parameters:
                    </span>
                    <pre className="text-xs bg-white border border-gray-200 rounded p-3 overflow-x-auto">
                    {JSON.stringify(toolCall.parameters, null, 2)}
                    </pre>
                </div>
                </div>
            ))}
            </div>

            {/* Raw Code (collapsed by default) */}
            <details className="mt-4">
            <summary className="text-sm font-semibold text-gray-700 cursor-pointer hover:text-gray-900">
                Show raw code
            </summary>
            <pre className="mt-2 text-xs bg-gray-800 text-gray-100 rounded p-3 overflow-x-auto">
                {pendingConfirmation.code}
            </pre>
            </details>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-gray-600">
                Do you want to allow this tool execution?
            </p>
            <div className="flex gap-3">
                <button
                onClick={handleReject}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
                >
                <XCircle className="h-4 w-4" />
                Reject
                </button>
                <button
                onClick={handleApprove}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                <CheckCircle className="h-4 w-4" />
                Approve
                </button>
            </div>
            </div>
        </div>
        </div>
    </div>
    </>
);
}