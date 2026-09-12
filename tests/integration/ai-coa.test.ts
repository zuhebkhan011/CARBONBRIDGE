import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/prisma.js';

describe('CoA Intelligence Integration & Security Suite', () => {
  let buyerToken: string;
  let sellerToken: string;
  let sellerCompanyId: string;
  let otherSellerToken: string;
  let batchWithCertId: string;
  let batchWithoutCertId: string;
  let sampleListingId: string;

  beforeAll(async () => {
    // Login as buyer
    const buyerRes = await request(app).post('/api/v1/auth/login').send({
      email: 'buyer.synfuels@ahmedabad.com',
      password: 'CarbonBridge2026!',
    });
    if (buyerRes.body.data?.tokens?.accessToken) {
      buyerToken = buyerRes.body.data.tokens.accessToken;
    }

    // Login as primary seller
    const sellerRes = await request(app).post('/api/v1/auth/login').send({
      email: 'seller.a@ultratech.com',
      password: 'CarbonBridge2026!',
    });
    if (sellerRes.body.data?.tokens?.accessToken) {
      sellerToken = sellerRes.body.data.tokens.accessToken;
      sellerCompanyId = sellerRes.body.data.user.companyId;
    }

    // Login as a different seller
    const otherSellerRes = await request(app).post('/api/v1/auth/login').send({
      email: 'seller.b@tatachemicals.com',
      password: 'CarbonBridge2026!',
    });
    if (otherSellerRes.body.data?.tokens?.accessToken) {
      otherSellerToken = otherSellerRes.body.data.tokens.accessToken;
    }

    // Find or create batch with certificate
    const cert = await prisma.certificateOfAnalysis.findFirst({
      include: { batch: true },
    });
    if (cert) {
      batchWithCertId = cert.batchId;
    }

    // Find batch without certificate
    const batchNoCert = await prisma.batch.findFirst({
      where: { certificate: null },
    });
    if (batchNoCert) {
      batchWithoutCertId = batchNoCert.id;
    }

    // Find a listing
    const listing = await prisma.listing.findFirst({
      where: { status: 'ACTIVE' },
    });
    if (listing) {
      sampleListingId = listing.id;
    }
  });

  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    const res = await request(app).get('/api/v1/ai/coa/some-batch-id');
    expect(res.status).toBe(401);

    const extractRes = await request(app).post('/api/v1/ai/coa/extract/some-batch-id');
    expect(extractRes.status).toBe(401);
  });

  it('rejects extraction triggers by buyer with 403 Forbidden (RBAC)', async () => {
    if (!buyerToken || !batchWithCertId) return;

    const res = await request(app)
      .post(`/api/v1/ai/coa/extract/${batchWithCertId}`)
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(403);
  });

  it('rejects extraction on batch without uploaded certificate with 400 Bad Request', async () => {
    if (!sellerToken || !batchWithoutCertId) return;

    const res = await request(app)
      .post(`/api/v1/ai/coa/extract/${batchWithoutCertId}`)
      .set('Authorization', `Bearer ${sellerToken}`);

    // If batch belongs to seller -> 400 No certificate; if other seller -> 403
    expect([400, 403]).toContain(res.status);
    if (res.status === 400) {
      const msg = res.body.error?.message || res.body.message || '';
      expect(msg).toContain('does not have an uploaded Certificate of Analysis');
    }
  });

  it('GET /api/v1/listings/:id includes certificate and extraction metadata for buyers', async () => {
    if (!buyerToken || !sampleListingId) return;

    const res = await request(app)
      .get(`/api/v1/listings/${sampleListingId}`)
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('batch');
    expect(res.body.data.batch).toHaveProperty('certificate');
  });

  it('ensures API responses NEVER contain forbidden "verified" phrases', async () => {
    if (!buyerToken || !sampleListingId) return;

    const res = await request(app)
      .get(`/api/v1/listings/${sampleListingId}`)
      .set('Authorization', `Bearer ${buyerToken}`);

    const bodyText = JSON.stringify(res.body).toLowerCase();
    expect(bodyText).not.toContain('certificate verified');
    expect(bodyText).not.toContain('lab verified');
    expect(bodyText).not.toContain('authenticity verified');
    expect(bodyText).not.toContain('ai verified');
  });
});
