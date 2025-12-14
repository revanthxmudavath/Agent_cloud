import { useAppStore } from '../stores/appStore';
import { TaskItem } from './TaskItem';
import { ChevronLeft, ChevronRight, ListTodo } from 'lucide-react';
import type { TaskFilter, WSMessageType } from '../types/index';
import { useTasks } from '../hooks/useTasks';

interface TaskPanelProps {
  sendMessage: (type: WSMessageType, payload: any) => boolean;
  isConnected: boolean;
}

export function TaskPanel({ sendMessage, isConnected }: TaskPanelProps) {
const userId = useAppStore((state) => state.userId);
const tasks = useAppStore((state) => state.getFilteredTasks());
const taskFilter = useAppStore((state) => state.taskFilter);
const setTaskFilter = useAppStore((state) => state.setTaskFilter);
const updateTask = useAppStore((state) => state.updateTask);
const isSidebarOpen = useAppStore((state) => state.isSidebarOpen);
const toggleSidebar = useAppStore((state) => state.toggleSidebar);

// Fetch tasks from backend on mount and when userId changes
useTasks(userId);

const handleToggleComplete = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Optimistic update for better UX
    const newCompleted = !task.completed;
    const newCompletedAt = newCompleted ? Date.now() : undefined;

    updateTask(taskId, {
      completed: newCompleted,
      completedAt: newCompletedAt,
    });

    // Sync to backend via WebSocket
    if (isConnected) {
      const success = sendMessage('complete_task', {
        taskId: taskId,
        completed: newCompleted,
      });

      if (!success) {
        // Rollback on send failure
        console.error('[TaskPanel] Failed to send task update, rolling back');
        updateTask(taskId, {
          completed: task.completed,
          completedAt: task.completedAt,
        });
      }
    } else {
      console.warn('[TaskPanel] Not connected - task update not synced to backend');
      // TODO: Queue updates for later sync when connection restored
    }
};

const filters: { value: TaskFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' },
];

const pendingCount = useAppStore((state) =>
    state.tasks.filter((t) => !t.completed).length
);

return (
    <>
   
    {!isSidebarOpen && (
        <button
        onClick={toggleSidebar}
        className="fixed top-20 left-4 z-30 bg-white border border-gray-300 rounded-lg p-2 shadow-lg hover:bg-gray-50 transition-colors"
        title="Open task panel"
        >
        <ChevronRight className="h-5 w-5 text-gray-600" />
        </button>
    )}

    <div
        className={`fixed top-0 left-0 h-screen bg-white border-r border-gray-200 z-30 transition-transform duration-300 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: '320px' }}
    >
       
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">Tasks</h2>
            {pendingCount > 0 && (
                <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full">
                {pendingCount}
                </span>
            )}
            </div>
            <button
            onClick={toggleSidebar}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            title="Close task panel"
            >
            <ChevronLeft className="h-5 w-5" />
            </button>
        </div>

       
        <div className="flex gap-2 mt-3">
            {filters.map((filter) => (
            <button
                key={filter.value}
                onClick={() => setTaskFilter(filter.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                taskFilter === filter.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
            >
                {filter.label}
            </button>
            ))}
        </div>
        </div>

 
        <div className="overflow-y-auto p-4 space-y-3" style={{ height: 'calc(100vh - 140px)' }}>
        {tasks.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
                <ListTodo className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">No tasks yet</p>
                <p className="text-xs mt-1">
                Ask your assistant to create a task
                </p>
            </div>
            </div>
        ) : (
            tasks.map((task) => (
            <TaskItem
                key={task.id}
                task={task}
                onToggleComplete={handleToggleComplete}
            />
            ))
        )}
        </div>
    </div>
    </>
);
}