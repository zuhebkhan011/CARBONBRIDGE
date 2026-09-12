import { z } from 'zod';

export const assistantChatSchema = z.object({
  message: z
    .string({ required_error: 'Message is required' })
    .trim()
    .min(1, 'Message cannot be empty')
    .max(1000, 'Message cannot exceed 1000 characters'),
  conversationId: z.string().trim().max(128).optional(),
  role: z.enum(['BUYER', 'SELLER', 'ADMIN']).optional(),
});

export type AssistantChatInput = z.infer<typeof assistantChatSchema>;
 
export const geminiAssistantResponseSchema = z.object({
  reply: z.string().min(1, 'Reply must not be empty'),
  suggestedActions: z
    .array(
      z.object({
        label: z.string(),
        action: z.string(),
      })
    )
    .optional()
    .default([]),
  relatedFeatures: z.array(z.string()).optional().default([]),
});

export type GeminiAssistantResponse = z.infer<typeof geminiAssistantResponseSchema>;
