import { useAppStore } from '../stores/appStore';
import { ConnectionStatus } from './ConnectionStatus';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import type { Message, WSMessageType, ConnectionStatus as ConnectionStatusType } from '../types/index';
import { useCallback } from 'react';

interface ChatInterfaceProps {
  status: ConnectionStatusType;
  sendMessage: (type: WSMessageType, payload: any) => boolean;
  isConnected: boolean;
}

export function ChatInterface({ status, sendMessage, isConnected }: ChatInterfaceProps) {
    const messages = useAppStore((state) => state.messages);
    const addMessage = useAppStore((state) => state.addMessage);
    const isTyping = useAppStore((state) => state.isTyping);
    const setIsTyping = useAppStore((state) => state.setIsTyping);
    const isSidebarOpen = useAppStore((state) => state.isSidebarOpen);

    const handleSendMessage = useCallback((content: string) => {
      if (!isConnected) {
        console.warn('[ChatInterface] Cannot send message - not connected');
        return;
      }

      
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      addMessage(userMessage);

     
      sendMessage('chat', { content });


      setIsTyping(true);
    }, [isConnected, sendMessage, addMessage, setIsTyping]);

    return (
    <div className={`flex flex-col h-screen bg-gray-50 transition-all duration-300 ${
      isSidebarOpen ? 'ml-80' : 'ml-0'
    }`}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">AI Assistant</h1>
            <p className="text-sm text-gray-500">Powered by Cloudflare Workers AI</p>
          </div>
          <ConnectionStatus status={status} />
        </div>
      </div>

      {/* Messages */}
      <MessageList messages={messages} isTyping={isTyping} />

      {/* Input */}
      <MessageInput 
        onSendMessage={handleSendMessage}
        disabled={!isConnected}
        placeholder={
          isConnected 
            ? "Type a message..." 
            : "Connecting to server..."
        }
      />
    </div>
  );
  }
