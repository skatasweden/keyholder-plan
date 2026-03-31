'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageBubble } from './message-bubble'
import { ChatInput } from './chat-input'
import { Loader2 } from 'lucide-react'

interface ChatWindowProps {
  tenantId: string
}

export function ChatWindow({ tenantId }: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: { tenantId },
      }),
    [tenantId]
  )

  const { messages, sendMessage, status } = useChat({
    transport,
  })

  const [executingMutation, setExecutingMutation] = useState(false)
  const isLoading = status === 'streaming' || status === 'submitted'

  const handleApproveMutation = useCallback(async (statements: string[]) => {
    setExecutingMutation(true)
    try {
      const res = await fetch('/api/execute-mutation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: tenantId, statements }),
      })
      const result = await res.json()
      if (result.allSucceeded) {
        sendMessage({ text: 'Mutation executed successfully.' })
      } else {
        const errors = result.results
          .filter((r: { success: boolean }) => !r.success)
          .map((r: { error: string }) => r.error)
          .join(', ')
        sendMessage({ text: `Mutation partially failed: ${errors}` })
      }
    } catch {
      sendMessage({ text: 'Failed to execute mutation. Please try again.' })
    } finally {
      setExecutingMutation(false)
    }
  }, [tenantId, sendMessage])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  function handleSend(text: string) {
    sendMessage({ text })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold">Chat</h2>
        <p className="text-xs text-gray-500">Ask anything about your accounting data</p>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center py-20">
              <div className="text-center">
                <p className="text-lg font-medium text-gray-400">
                  Start a conversation
                </p>
                <p className="mt-1 text-sm text-gray-400">
                  Ask about your transactions, generate reports, or build custom tools.
                </p>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onApproveMutation={handleApproveMutation}
            />
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-gray-500">Thinking...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <ChatInput onSend={handleSend} isLoading={isLoading} />
    </div>
  )
}
