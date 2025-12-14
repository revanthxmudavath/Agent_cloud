import { useEffect, useCallback } from 'react';
  import { useAppStore } from './stores/appStore';
  import { ChatInterface } from './components/ChatInterface';
  import { ConfirmationDialog } from './components/ConfirmationDialog';
import { TaskPanel } from './components/TaskPanel';
import { useWebSocket } from './hooks/useWebSocket';
import type { WSMessage, Message } from './types/index';
import { useTasks } from './hooks/useTasks';

  function App() {
    const setUserId = useAppStore((state) => state.setUserId);
    const userId = useAppStore((state) => state.userId);
    const addMessage = useAppStore((state) => state.addMessage);
    const setIsTyping = useAppStore((state) => state.setIsTyping);
    const setPendingConfirmation = useAppStore((state) => state.setPendingConfirmation);

    const { fetchTasks } = useTasks(userId);

    useEffect(() => {
      async function initializeUser() {
        try {
          // Check if userId exists in localStorage
          const storedUserId = localStorage.getItem('userId');

          if (storedUserId) {
            console.log('[App] Using stored userId:', storedUserId);
            setUserId(storedUserId);
            return;
          }

          // Generate new userId if none exists
          const response = await fetch('/api/users/generate-id');
          const data = await response.json();

          console.log('[App] Generated new userId:', data.userId);

          // Store in localStorage for persistence
          localStorage.setItem('userId', data.userId);
          setUserId(data.userId);
        } catch (error) {
          console.error('[App] Failed to generate userId:', error);

          // Fallback: generate client-side UUID
          const fallbackUserId = crypto.randomUUID();
          console.log('[App] Using fallback userId:', fallbackUserId);
          localStorage.setItem('userId', fallbackUserId);
          setUserId(fallbackUserId);
        }
      }

      initializeUser();
    }, [setUserId]);

    // Centralized WebSocket message handler
    const handleWebSocketMessage = useCallback((wsMessage: WSMessage) => {
      console.log('[App] Received message:', wsMessage.type);

      switch (wsMessage.type) {
          case 'connected':
              console.log('[App] Connected as user:', wsMessage.payload.userId);
          break;

          case 'chat_response':
              const assistantMessage: Message = {
                  id: wsMessage.payload.messageId || crypto.randomUUID(),
                  role: 'assistant',
                  content: wsMessage.payload.content,
                  timestamp: wsMessage.timestamp,
              };
              addMessage(assistantMessage);
              setIsTyping(false);
              break;

          case 'confirmation_request':
              console.log('[App] Confirmation requested:', wsMessage.payload);
              setPendingConfirmation({
                  requestId: wsMessage.payload.requestId,
                  code: wsMessage.payload.code,
                  toolCalls: wsMessage.payload.toolCalls,
                  expiresAt: Date.now() + wsMessage.payload.timeout,
              });
              setIsTyping(false);
              break;

          case 'tool_execution_result':
              // Add tool result as system message with actual data
              console.log('[App] Tool execution result:', JSON.stringify(wsMessage.payload, null, 2));
              let resultContent = '';

              if (wsMessage.payload.success) {
                  // Show actual tool output data for different tools
                  if (wsMessage.payload.toolName === 'getWeather' && wsMessage.payload.output?.city) {
                      const weather = wsMessage.payload.output;
                      resultContent = `🌤️ Weather in ${weather.city}, ${weather.country}:\n` +
                          `Temperature: ${weather.temperature}°C (feels like ${weather.feelsLike}°C)\n` +
                          `Conditions: ${weather.description}\n` +
                          `Humidity: ${weather.humidity}% | Wind: ${weather.windSpeed} m/s`;
                  } else if (wsMessage.payload.output?.message) {
                      resultContent = `✅ ${wsMessage.payload.output.message}`;
                  } else {
                      resultContent = `✅ Tool "${wsMessage.payload.toolName}" executed successfully`;
                  }
              } else {
                  resultContent = `❌ Tool "${wsMessage.payload.toolName}" failed: ${wsMessage.payload.error}`;
              }

              const resultMessage: Message = {
                  id: crypto.randomUUID(),
                  role: 'system',
                  content: resultContent,
                  timestamp: wsMessage.timestamp,
              };
              addMessage(resultMessage);

              if (wsMessage.payload.success &&
                ['createTask', 'updateTask', 'completeTask', 'deleteTask'].includes(wsMessage.payload.toolName)) {
                  console.log('[App] Refreshing tasks after tool execution');
                  fetchTasks();
                }
              break;

          case 'error':
              const errorMessage: Message = {
                  id: crypto.randomUUID(),
                  role: 'system',
                  content: `Error: ${wsMessage.payload.message}`,
                  timestamp: wsMessage.timestamp,
              };
              addMessage(errorMessage);
              setIsTyping(false);
              break;

          case 'status':
              console.log('[App] Status:', wsMessage.payload.message);
              break;

          default:
              console.warn('[App] Unknown message type:', wsMessage.type);
    }
  }, [addMessage, setIsTyping, setPendingConfirmation, fetchTasks]);

  // Single WebSocket connection for entire app
  const { status, sendMessage, isConnected } = useWebSocket(userId, {
      onMessage: handleWebSocketMessage,
  });

    return (
      <>
        <TaskPanel sendMessage={sendMessage} isConnected={isConnected} />
        <ChatInterface
          status={status}
          sendMessage={sendMessage}
          isConnected={isConnected}
        />
        <ConfirmationDialog sendMessage={sendMessage} />
      </>
    );
  }

  export default App;