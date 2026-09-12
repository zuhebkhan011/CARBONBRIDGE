import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/prisma.js';
import { AuctionStatus, SellingMethod, BatchStatus, ListingStatus } from '@prisma/client';

describe('Profile Endpoint & Bid Validation Integration Suite', () => {
  let buyerToken: string;
  let buyerUserId: string;
  let buyerCompanyId: string;

  let sellerToken: string;
  let sellerUserId: string;
  let sellerCompanyId: string;

  let openAuctionId: string;
  let expiredAuctionId: string;

  beforeAll(async () => {
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

    // 3. Create a clean test batch & auction for testing
    const batch = await prisma.batch.create({
      data: {
        batchNumber: `TEST-AUC-${Date.now()}`,
        sellerId: sellerCompanyId,
        capturedQuantity: 100,
        availableQuantity: 100,
        allocatedQuantity: 0,
        purityPercentage: 99.5,
        storagePressureBar: 15.5,
        storageTemperatureC: -20.0,
        locationLat: 20.0,
        locationLng: 78.0,
        status: BatchStatus.ACTIVE,
      },
    });

    const listing = await prisma.listing.create({
      data: {
        batchId: batch.id,
        sellerId: sellerCompanyId,
        sellingMethod: SellingMethod.AUCTION,
        quantity: 100,
        status: ListingStatus.ACTIVE,
      },
    });

    const auction = await prisma.auction.create({
      data: {
        listingId: listing.id,
        batchId: batch.id,
        sellerId: sellerCompanyId,
        quantity: 100,
        baseReservePrice: 2000,
        currentHighestBid: 2000,
        minBidIncrement: 50,
        closingTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h future
        status: AuctionStatus.OPEN,
      },
    });
    openAuctionId = auction.id;

    // Expired auction
    const expBatch = await prisma.batch.create({
      data: {
        batchNumber: `TEST-EXP-${Date.now()}`,
        sellerId: sellerCompanyId,
        capturedQuantity: 50,
        availableQuantity: 50,
        allocatedQuantity: 0,
        purityPercentage: 98.0,
        storagePressureBar: 15.5,
        storageTemperatureC: -20.0,
        locationLat: 20.0,
        locationLng: 78.0,
        status: BatchStatus.ACTIVE,
      },
    });
    const expListing = await prisma.listing.create({
      data: {
        batchId: expBatch.id,
        sellerId: sellerCompanyId,
        sellingMethod: SellingMethod.AUCTION,
        quantity: 50,
        status: ListingStatus.ACTIVE,
      },
    });
    const expAuction = await prisma.auction.create({
      data: {
        listingId: expListing.id,
        batchId: expBatch.id,
        sellerId: sellerCompanyId,
        quantity: 50,
        baseReservePrice: 1500,
        currentHighestBid: 1500,
        minBidIncrement: 50,
        closingTime: new Date(Date.now() - 1000), // in the past
        status: AuctionStatus.OPEN,
      },
    });
    expiredAuctionId = expAuction.id;
  });

  describe('1. Profile API (GET /api/v1/users/me & GET /api/v1/auth/me)', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/users/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns authentic buyer profile without passwordHash or sensitive credentials', async () => {
      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(buyerUserId);
      expect(res.body.data.role).toBe('BUYER');
      expect(res.body.data.email).toBe('buyer.synfuels@ahmedabad.com');
      expect(res.body.data.company).toBeDefined();
      expect(res.body.data.company.name).toBeDefined();
      expect(res.body.data).not.toHaveProperty('passwordHash');
      expect(res.body.data).not.toHaveProperty('refreshToken');
    });

    it('returns authentic seller profile with company details for seller token', async () => {
      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(sellerUserId);
      expect(res.body.data.role).toBe('SELLER');
      expect(res.body.data.company.name).toContain('UltraTech');
    });

    it('GET /api/v1/auth/me also returns the exact profile seamlessly', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('buyer.synfuels@ahmedabad.com');
    });
  });

  describe('2. Comprehensive Bid Validation', () => {
    it('rejects empty or non-numeric bid with clear error', async () => {
      const res = await request(app)
        .post(`/api/v1/auctions/${openAuctionId}/bid`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ amountPerTon: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/valid number/i);
    });

    it('rejects negative or zero bid with clear error', async () => {
      const res = await request(app)
        .post(`/api/v1/auctions/${openAuctionId}/bid`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ amountPerTon: -500 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/greater than zero/i);
    });

    it('rejects bid below base reserve price with informative message', async () => {
      const res = await request(app)
        .post(`/api/v1/auctions/${openAuctionId}/bid`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ amountPerTon: 1800 }); // Reserve is 2000

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('BID_BELOW_MINIMUM');
      expect(res.body.error.message).toContain('Bid must be at least ₹2000');
    });

    it('rejects seller bidding on their own auction', async () => {
      const res = await request(app)
        .post(`/api/v1/auctions/${openAuctionId}/bid`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ amountPerTon: 2500 });

      expect([400, 403]).toContain(res.status);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/seller|role|forbidden/i);
    });

    it('rejects bid on expired auction', async () => {
      const res = await request(app)
        .post(`/api/v1/auctions/${expiredAuctionId}/bid`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ amountPerTon: 2500 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/ended|not open/i);
    });

    it('accepts valid initial bid at or above reserve price and updates currentHighestBid', async () => {
      const res = await request(app)
        .post(`/api/v1/auctions/${openAuctionId}/bid`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ amountPerTon: 2206 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(Number(res.body.data.amountPerTon)).toBe(2206);

      // Verify auction highest bid updated
      const auction = await prisma.auction.findUnique({ where: { id: openAuctionId } });
      expect(Number(auction?.currentHighestBid)).toBe(2206);
    });

    it('rejects subsequent bid below highest bid + min increment (2206 + 50 = 2256)', async () => {
      const res = await request(app)
        .post(`/api/v1/auctions/${openAuctionId}/bid`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ amountPerTon: 2200 }); // Below 2256

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('BID_BELOW_MINIMUM');
      expect(res.body.error.message).toContain('Bid must be at least ₹2256/T');
    });

    it('accepts next valid bid at or above 2256', async () => {
      const res = await request(app)
        .post(`/api/v1/auctions/${openAuctionId}/bid`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ amountPerTon: 2300 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(Number(res.body.data.amountPerTon)).toBe(2300);

      const auction = await prisma.auction.findUnique({ where: { id: openAuctionId } });
      expect(Number(auction?.currentHighestBid)).toBe(2300);
    });
  });

  describe('3. Profile Live Update API (PATCH /api/v1/users/me)', () => {
    it('rejects unauthenticated PATCH requests with 401', async () => {
      const res = await request(app)
        .patch('/api/v1/users/me')
        .send({ fullName: 'Hacker Name' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects attempts to modify unauthorized fields like role or id', async () => {
      const res = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects empty string / whitespace values', async () => {
      const res = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ fullName: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('successfully updates user fullName, company name, and location', async () => {
      const updatePayload = {
        fullName: 'Dr. Vikram Sarabhai',
        companyName: 'Gujarat SynFuels Corp Updated',
        companyLocation: 'Plot 102, GIDC Industrial Estate, Ankleshwar',
      };

      const res = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fullName).toBe(updatePayload.fullName);
      expect(res.body.data.company.name).toBe(updatePayload.companyName);
      expect(res.body.data.company.address).toBe(updatePayload.companyLocation);
      expect(res.body.data).not.toHaveProperty('passwordHash');

      // Verify persistence in database
      const dbUser = await prisma.user.findUnique({
        where: { id: buyerUserId },
        include: { company: true },
      });
      expect(dbUser?.fullName).toBe(updatePayload.fullName);
      expect(dbUser?.company.name).toBe(updatePayload.companyName);
      expect(dbUser?.company.address).toBe(updatePayload.companyLocation);
    });

    it('seller can also update their own profile independently without IDOR', async () => {
      const res = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          fullName: 'Aneeq Seller Lead',
          companyName: 'UltraTech Captures India Ltd',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.fullName).toBe('Aneeq Seller Lead');
      expect(res.body.data.company.name).toBe('UltraTech Captures India Ltd');

      // Ensure buyer was not touched
      const buyerInDb = await prisma.user.findUnique({ where: { id: buyerUserId } });
      expect(buyerInDb?.fullName).toBe('Dr. Vikram Sarabhai');
    });
  });

  describe('4. Register Batch without Storage City / State', () => {
    it('creates batch successfully when storageCity and storageState are omitted', async () => {
      const batchNumber = `CB-BATCH-TEST-${Date.now()}`;
      const res = await request(app)
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          batchNumber,
          capturedQuantity: 350,
          purityPercentage: 99.2,
          storagePressureBar: 18,
          storageTemperatureC: -15,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.batchNumber).toBe(batchNumber);
      expect(Number(res.body.data.availableQuantity)).toBe(350);

      const dbBatch = await prisma.batch.findUnique({ where: { batchNumber } });
      expect(dbBatch).toBeDefined();
      expect(Number(dbBatch?.locationLat)).toBeGreaterThan(0);
    });
  });
});
