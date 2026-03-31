'use client'

import { cn } from '@/lib/utils'
import { ToolCallCard } from './tool-call-card'
import { MutationConfirm } from './mutation-confirm'
import type { UIMessage } from 'ai'

interface MessageBubbleProps {
  message: UIMessage
  onApproveMutation?: (statements: string[]) => void
}

function isToolPart(part: { type: string }): boolean {
  return part.type.startsWith('tool-')
}

function getToolName(partType: string): string {
  return partType.replace(/^tool-/, '')
}

export function MessageBubble({ message, onApproveMutation }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div
      className={cn(
        'flex w-full',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-2',
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-900'
        )}
      >
        {message.parts?.map((part, i) => {
          if (part.type === 'text') {
            return (
              <div key={i} className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap">{part.text}</p>
              </div>
            )
          }

          if (isToolPart(part)) {
            const toolPart = part as {
              type: string
              toolCallId: string
              state: string
              input?: Record<string, unknown>
              output?: Record<string, unknown>
            }
            const toolName = getToolName(toolPart.type)
            const args = (toolPart.input ?? {}) as Record<string, unknown>
            const result = toolPart.output as Record<string, unknown> | undefined

            // Show mutation confirmation card
            if (
              toolName === 'execute_mutation' &&
              toolPart.state === 'output-available' &&
              result?.status === 'pending_approval'
            ) {
              return (
                <MutationConfirm
                  key={i}
                  description={String(result.description ?? '')}
                  statements={result.statements as string[]}
                  validationNotes={result.validation_notes as string | undefined}
                  onApprove={() => onApproveMutation?.(result.statements as string[])}
                  onCancel={() => {}}
                />
              )
            }

            return (
              <ToolCallCard
                key={i}
                toolName={toolName}
                args={args}
                result={result}
                state={toolPart.state}
              />
            )
          }

          return null
        })}

        {/* Fallback for messages without text parts */}
        {!message.parts?.some(p => p.type === 'text') && (
          <p className="whitespace-pre-wrap text-gray-400">...</p>
        )}
      </div>
    </div>
  )
}
