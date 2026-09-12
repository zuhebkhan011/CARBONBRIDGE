import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/prisma.js';
import { GeminiService } from '../../src/modules/ai/gemini.service.js';

describe('AI Assistant Integration Suite', () => {
  let buyerToken: string;
  let sellerToken: string;
  let buyerUserId: string;
  let sellerUserId: string;
  let buyerCompanyId: string;
  let sellerCompanyId: string;


  beforeAll(async () => {
    // Mock GeminiService to respond deterministically and avoid external network delays
    vi.spyOn(GeminiService, 'generateJsonDetailed').mockImplementation(async (options) => {
      const prompt = options.userPrompt.toLowerCase();
      if (prompt.includes('fail') || prompt.includes('timeout')) {
        return {
          success: false,
          data: null,
          model: 'gemini-3.5-flash',
          latencyMs: 10,
          errorCategory: 'timeout',
          errorMessage: 'Request timed out',
        };
      }

      if (prompt.includes('buy co2') || prompt.includes('how do i buy') || prompt.includes('requirement')) {
        return {
          success: true,
          data: {
            reply: 'To buy industrial CO2 on CarbonBridge, post a requirement with required tonnage, purity, and delivery deadline.',
            suggestedActions: [
              { label: 'Post Requirement', action: 'POST_REQUIREMENT' },
              { label: 'Browse Marketplace', action: 'MARKETPLACE' },
            ],
            relatedFeatures: ['POST_REQUIREMENT', 'SMART_MATCHING'],
          },
          model: 'gemini-3.5-flash',
          latencyMs: 15,
        };
      }


      if (prompt.includes('sell')) {
        return {
          success: true,
          data: {
            reply: 'To sell captured CO2 on CarbonBridge, register your batch with capture location and tonnage.',
            suggestedActions: [
              { label: 'Register Batch', action: 'REGISTER_BATCH' },
              { label: 'Create Listing', action: 'CREATE_LISTING' },
            ],
            relatedFeatures: ['REGISTER_BATCH', 'CREATE_LISTING'],
          },
          model: 'gemini-3.5-flash',
          latencyMs: 15,
        };
      }

      if (prompt.includes('buying') || prompt.includes('listings') || prompt.includes('batches') || prompt.includes('history')) {
        return {
          success: true,
          data: {
            reply: 'Here is your authorized CarbonBridge activity summary based on your actual records.',
            suggestedActions: [
              { label: 'Post Requirement', action: 'POST_REQUIREMENT' },
            ],
            relatedFeatures: ['POST_REQUIREMENT', 'ORDERS'],
          },
          model: 'gemini-3.5-flash',
          latencyMs: 15,
        };
      }

      return {
        success: true,
        data: {
          reply: 'I can guide you through CarbonBridge workflows.',
          suggestedActions: [
            { label: 'Browse Marketplace', action: 'MARKETPLACE' },
          ],
          relatedFeatures: ['MARKETPLACE'],
        },
        model: 'gemini-3.5-flash',
        latencyMs: 15,
      };
    });

    // 1. Authenticate buyer
    const buyerLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'buyer.synfuels@ahmedabad.com',
      password: 'CarbonBridge2026!',
    });
    expect(buyerLogin.status).toBe(200);
    buyerToken = buyerLogin.body.data.tokens.accessToken;
    buyerUserId = buyerLogin.body.data.user.id;
    buyerCompanyId = buyerLogin.body.data.user.companyId;

    // 2. Authenticate seller
    const sellerLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'seller.a@ultratech.com',
      password: 'CarbonBridge2026!',
    });
    expect(sellerLogin.status).toBe(200);
    sellerToken = sellerLogin.body.data.tokens.accessToken;
    sellerUserId = sellerLogin.body.data.user.id;
    sellerCompanyId = sellerLogin.body.data.user.companyId;
  });



  describe('1. Authentication & Security Boundaries', () => {
    it('rejects unauthenticated chat requests with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/ai/assistant/chat')
        .send({ message: 'How do I buy CO2?' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects unauthenticated onboarding requests with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/ai/assistant/onboarding');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Input Validation', () => {
    it('returns 400 Bad Request for empty message', async () => {
      const res = await request(app)
        .post('/api/v1/ai/assistant/chat')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ message: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 Bad Request for message exceeding 1000 characters', async () => {
      const res = await request(app)
        .post('/api/v1/ai/assistant/chat')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ message: 'A'.repeat(1005) });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. Buyer Role Onboarding & Chat Guidance', () => {
    it('returns buyer-tailored onboarding card on GET /onboarding', async () => {
      const res = await request(app)
        .get('/api/v1/ai/assistant/onboarding')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.onboardingCard.role).toBe('BUYER');
      expect(res.body.data.onboardingCard.steps.length).toBe(6);
      expect(res.body.data.starterResponse.suggestedActions.some((a: any) => a.action === 'POST_REQUIREMENT')).toBe(true);
    });

    it('answers buyer question with structured reply and valid deep links', async () => {
      const res = await request(app)
        .post('/api/v1/ai/assistant/chat')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ message: 'How do I buy CO2?' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reply).toBeDefined();
      expect(res.body.data.conversationId).toBeDefined();
      expect(Array.isArray(res.body.data.suggestedActions)).toBe(true);

      const postReq = res.body.data.suggestedActions.find((a: any) => a.action === 'POST_REQUIREMENT');
      expect(postReq).toBeDefined();
      expect(postReq.path).toBe('/requirements/new');
    });
  });

  describe('4. Seller Role Onboarding & Chat Guidance', () => {
    it('returns seller-tailored onboarding card on GET /onboarding', async () => {
      const res = await request(app)
        .get('/api/v1/ai/assistant/onboarding')
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.onboardingCard.role).toBe('SELLER');
      expect(res.body.data.onboardingCard.steps.length).toBe(6);
      expect(res.body.data.starterResponse.suggestedActions.some((a: any) => a.action === 'REGISTER_BATCH')).toBe(true);
    });

    it('answers seller question with seller-specific guidance', async () => {
      const res = await request(app)
        .post('/api/v1/ai/assistant/chat')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ message: 'How do I sell my captured CO2?' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reply.toLowerCase()).toContain('batch');
      expect(res.body.data.suggestedActions.some((a: any) => a.action === 'REGISTER_BATCH')).toBe(true);
    });

  });

  describe('5. Multi-Turn Conversation Continuity', () => {
    it('maintains conversation context across turns using conversationId', async () => {
      // Turn 1
      const turn1 = await request(app)
        .post('/api/v1/ai/assistant/chat')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ message: 'What is Smart Matching?' });

      expect(turn1.status).toBe(200);
      const convId = turn1.body.data.conversationId;
      expect(convId).toBeDefined();

      // Turn 2: Follow-up using same conversationId
      const turn2 = await request(app)
        .post('/api/v1/ai/assistant/chat')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          conversationId: convId,
          message: 'Can I use it for 500 tonnes of CO2 in Ahmedabad?',
        });

      expect(turn2.status).toBe(200);
      expect(turn2.body.data.conversationId).toBe(convId);
      expect(turn2.body.data.reply).toBeDefined();
    });
  });

  describe('6. Read-Only Safety Verification (Zero Database Mutations)', () => {
    it('does not create any requirements, batches, or listings when answering purchase or sale queries', async () => {
      // Send intent query that could be mistaken for an action with distinct test parameters
      const res = await request(app)
        .post('/api/v1/ai/assistant/chat')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ message: 'I want to post a requirement for 777 tonnes of CO2 in Porbandar at 99.7% purity.' });

      expect(res.status).toBe(200);
      expect(res.body.data.suggestedActions.some((a: any) => a.action === 'POST_REQUIREMENT')).toBe(true);

      // Verify no database record was created from the chat query
      const createdReq = await prisma.requirement.findFirst({
        where: {
          buyerId: buyerCompanyId,
          targetQuantity: 777,
        },
      });
      expect(createdReq).toBeNull();

      const createdBatch = await prisma.batch.findFirst({
        where: {
          sellerId: sellerCompanyId,
          capturedQuantity: 777,
        },
      });
      expect(createdBatch).toBeNull();
    });
  });

  describe('7. Personalized Insights & Intent Tagging', () => {
    it('detects PERSONAL_INSIGHT intent and tags response for buyer activity query', async () => {
      const res = await request(app)
        .post('/api/v1/ai/assistant/chat')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ message: 'What have I been buying recently?' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.intent).toBe('PERSONAL_INSIGHT');
      expect(res.body.data.isPersonalized).toBe(true);
      expect(res.body.data.reply).toBeDefined();
    });

    it('detects PERSONAL_INSIGHT intent and tags response for seller activity query', async () => {
      const res = await request(app)
        .post('/api/v1/ai/assistant/chat')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ message: 'How are my listings doing?' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.intent).toBe('PERSONAL_INSIGHT');
      expect(res.body.data.isPersonalized).toBe(true);
      expect(res.body.data.reply).toBeDefined();
    });
  });

  describe('8. Role Spoofing & RBAC Enforcement', () => {
    it('ignores client-supplied role in body and enforces authenticated JWT role (BUYER)', async () => {
      // Buyer token sends { role: 'SELLER' }
      const res = await request(app)
        .post('/api/v1/ai/assistant/chat')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          role: 'SELLER',
          message: 'How do I buy CO2?',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Ensure returned actions are sanitized strictly according to the JWT role (BUYER)
      const hasSellerActions = res.body.data.suggestedActions.some(
        (a: any) => a.action === 'REGISTER_BATCH' || a.action === 'CREATE_LISTING'
      );
      expect(hasSellerActions).toBe(false);
    });
  });

  describe('9. Graceful AI Fallback & Failure Recovery', () => {
    it('gracefully falls back to deterministic engine when Gemini fails', async () => {
      const res = await request(app)
        .post('/api/v1/ai/assistant/chat')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ message: 'Can you fail this request to test fallback?' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.source).toBe('DETERMINISTIC_FALLBACK');
      expect(res.body.data.reply).toBeDefined();
    });
  });
});
