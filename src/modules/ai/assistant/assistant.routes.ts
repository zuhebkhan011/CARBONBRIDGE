import { Router } from 'express';
import { AssistantController } from './assistant.controller.js';
import { authenticate } from '../../../common/middleware/auth.js';
import { aiAssistantRateLimiter } from '../../../common/middleware/rateLimiter.js';

export const assistantRouter = Router();

assistantRouter.use(authenticate);

// Chat with the Assistant (Rate-limited to prevent abuse)
assistantRouter.post('/chat', aiAssistantRateLimiter, AssistantController.chat);

// Get role-tailored onboarding guidance & checklist
assistantRouter.get('/onboarding', AssistantController.getOnboarding);
