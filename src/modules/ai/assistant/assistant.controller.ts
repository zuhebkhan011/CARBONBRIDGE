import { Request, Response, NextFunction } from 'express';
import { assistantChatSchema } from './assistant.schemas.js';
import { AssistantService } from './assistant.service.js';
import { AssistantRole } from './assistant.types.js';

export class AssistantController {
  /**
   * POST /api/v1/ai/assistant/chat
   */
  public static async chat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = assistantChatSchema.parse(req.body);
      const userId = req.user?.userId || (req.user as any)?.id || 'anonymous';
      const role: AssistantRole = (req.user?.role as AssistantRole) || 'BUYER';
      const companyId = req.user?.companyId || '';

      const result = await AssistantService.chat(userId, role, validated, companyId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/ai/assistant/onboarding
   */
  public static async getOnboarding(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId || (req.user as any)?.id || 'anonymous';
      const role: AssistantRole = (req.user?.role as AssistantRole) || 'BUYER';

      const result = await AssistantService.getOnboardingGuidance(userId, role);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

