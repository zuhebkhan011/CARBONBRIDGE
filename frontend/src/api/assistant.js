import { api } from './client.js';

export const assistantApi = {
  chat: (message, conversationId, role) =>
    api.post('/ai/assistant/chat', { message, conversationId, role }),

  getOnboarding: () =>
    api.get('/ai/assistant/onboarding'),
};
