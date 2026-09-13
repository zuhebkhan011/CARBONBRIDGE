import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/prisma.js';
import { Role, CompanyType, ShipmentIndividualStatus, OrderType, OrderOverallStatus, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { resolveLocationCoordinates } from '../../src/common/utils/geo.js';

describe('Buyer Active Map Destination Coordinates & Data Consistency Suite', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('CarbonBridge2026!', 10);
  });

  // Helper to create an authenticated buyer and an active shipment
  async function setupBuyerWithShipment(address: string, initialLat: number, initialLng: number, cityExpected: string, latExpected: number, lngExpected: number) {
    const timestamp = Date.now() + Math.floor(Math.random() * 10000);

    const seller = await prisma.company.create({
      data: {
        name: `Seller Plant ${timestamp}`,
        companyType: CompanyType.EMITTER,
        registrationNumber: `REG-SELLER-${timestamp}`,
        address: 'GIDC Industrial Area, Ankleshwar, Gujarat',
        latitude: 21.6264,
        longitude: 73.0033,
      },
    });

    const buyer = await prisma.company.create({
      data: {
        name: `Buyer Facility ${timestamp}`,
        companyType: CompanyType.OFFTAKER,
        registrationNumber: `REG-BUYER-${timestamp}`,
        address,
        latitude: initialLat,
        longitude: initialLng,
      },
    });

    const buyerUser = await prisma.user.create({
      data: {
        email: `buyer.${timestamp}@delivery.com`,
        passwordHash,
        fullName: 'Test Buyer User',
        role: Role.BUYER,
        companyId: buyer.id,
      },
    });

    const batch = await prisma.batch.create({
      data: {
        batchNumber: `CB-BATCH-${timestamp}`,
        sellerId: seller.id,
        capturedQuantity: new Prisma.Decimal(500),
        availableQuantity: new Prisma.Decimal(300),
        purityPercentage: new Prisma.Decimal(99.5),
        storageTemperatureC: new Prisma.Decimal(-20),
        storagePressureBar: new Prisma.Decimal(18),
        locationLat: new Prisma.Decimal(21.6264),
        locationLng: new Prisma.Decimal(73.0033),
      },
    });

    const order = await prisma.order.create({
      data: {
        orderNumber: `CB-ORD-${timestamp}`,
        orderType: OrderType.SINGLE_SELLER,
        buyerId: buyer.id,
        totalQuantity: new Prisma.Decimal(200),
        totalPrice: new Prisma.Decimal(460000),
        overallStatus: OrderOverallStatus.CONFIRMED,
      },
    });

    const allocation = await prisma.allocation.create({
      data: {
        orderId: order.id,
        batchId: batch.id,
        sellerId: seller.id,
        allocatedQuantity: new Prisma.Decimal(200),
        pricePerTon: new Prisma.Decimal(2300),
      },
    });

    await prisma.shipment.create({
      data: {
        orderId: order.id,
        allocationId: allocation.id,
        sellerId: seller.id,
        buyerId: buyer.id,
        individualStatus: ShipmentIndividualStatus.IN_TRANSIT,
        originLat: new Prisma.Decimal(21.6264),
        originLng: new Prisma.Decimal(73.0033),
        destinationLat: new Prisma.Decimal(initialLat),
        destinationLng: new Prisma.Decimal(initialLng),
        trackingNotes: 'En route to buyer site',
      },
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: buyerUser.email,
      password: 'CarbonBridge2026!',
    });

    return {
      token: loginRes.body.data.tokens.accessToken,
      buyerId: buyer.id,
      cityExpected,
      latExpected,
      lngExpected,
    };
  }

  it('TEST 1: Buyer destination "ahmedaba, gujarat" resolves to Ahmedabad coordinates (not central India)', async () => {
    // Note: initialLat = 20.59, initialLng = 78.96 (simulates the bogus centroid bug)
    const { token } = await setupBuyerWithShipment('ahmedaba, gujarat', 20.59, 78.96, 'Ahmedabad', 23.0225, 72.5714);

    const res = await request(app)
      .get('/api/v1/maps/active')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.activeRunsCount).toBe(1);

    // Root destination check
    expect(data.destination).toBeDefined();
    expect(data.destination.city).toBe('Ahmedabad');
    expect(data.destination.state).toBe('Gujarat');
    expect(data.destination.latitude).toBeCloseTo(23.0225, 3);
    expect(data.destination.longitude).toBeCloseTo(72.5714, 3);

    // Route destination check
    const route = data.routes[0];
    expect(route.destination.city).toBe('Ahmedabad');
    expect(route.destination.latitude).toBeCloseTo(23.0225, 3);
    expect(route.destination.longitude).toBeCloseTo(72.5714, 3);

    // Route road geometry must NOT end in central India (20.59, 78.96)
    expect(route.geometry.length).toBeGreaterThan(1);
    const lastPoint = route.geometry[route.geometry.length - 1];
    expect(lastPoint[0]).toBeCloseTo(23.0225, 1);
    expect(lastPoint[1]).toBeCloseTo(72.5714, 1);
  });

  it('TEST 2: Buyer destination "Rajkot, Gujarat" moves B marker to Rajkot', async () => {
    const { token } = await setupBuyerWithShipment('GIDC Metoda, Rajkot, Gujarat', 20.5938, 78.9629, 'Rajkot', 22.3039, 70.8022);

    const res = await request(app)
      .get('/api/v1/maps/active')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.destination.city).toBe('Rajkot');
    expect(data.destination.state).toBe('Gujarat');
    expect(data.destination.latitude).toBeCloseTo(22.3039, 3);
    expect(data.destination.longitude).toBeCloseTo(70.8022, 3);
  });

  it('TEST 3: Buyer destination "Vadodara, Gujarat" resolves to Vadodara coordinates', async () => {
    const { token } = await setupBuyerWithShipment('Ranoli Industrial Area, Vadodara, Gujarat', 20.59, 78.96, 'Vadodara', 22.3072, 73.1812);

    const res = await request(app)
      .get('/api/v1/maps/active')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.destination.city).toBe('Vadodara');
    expect(data.destination.state).toBe('Gujarat');
    expect(data.destination.latitude).toBeCloseTo(22.3072, 3);
    expect(data.destination.longitude).toBeCloseTo(73.1812, 3);
  });

  it('TEST 4: Multiple suppliers -> Ahmedabad buyer all terminate at the same Ahmedabad B marker', async () => {
    const timestamp = Date.now() + Math.floor(Math.random() * 10000);

    const buyer = await prisma.company.create({
      data: {
        name: `Multi Supplier Offtaker ${timestamp}`,
        companyType: CompanyType.OFFTAKER,
        registrationNumber: `REG-MULTI-BUYER-${timestamp}`,
        address: 'Naroda Industrial Estate, Ahmedabad, Gujarat',
        latitude: 23.0225,
        longitude: 72.5714,
      },
    });

    const buyerUser = await prisma.user.create({
      data: {
        email: `multi.buyer.${timestamp}@offtaker.com`,
        passwordHash,
        fullName: 'Multi Buyer Manager',
        role: Role.BUYER,
        companyId: buyer.id,
      },
    });

    // 3 distinct sellers: Vadodara, Ankleshwar, Surat
    const sellerA = await prisma.company.create({
      data: { name: `Seller A ${timestamp}`, companyType: CompanyType.EMITTER, registrationNumber: `A-${timestamp}`, address: 'Vadodara, Gujarat', latitude: 22.3072, longitude: 73.1812 },
    });
    const sellerB = await prisma.company.create({
      data: { name: `Seller B ${timestamp}`, companyType: CompanyType.EMITTER, registrationNumber: `B-${timestamp}`, address: 'Ankleshwar, Gujarat', latitude: 21.6264, longitude: 73.0033 },
    });
    const sellerC = await prisma.company.create({
      data: { name: `Seller C ${timestamp}`, companyType: CompanyType.EMITTER, registrationNumber: `C-${timestamp}`, address: 'Surat, Gujarat', latitude: 21.1702, longitude: 72.8311 },
    });

    const batchA = await prisma.batch.create({
      data: { batchNumber: `B-A-${timestamp}`, sellerId: sellerA.id, capturedQuantity: new Prisma.Decimal(100), availableQuantity: new Prisma.Decimal(0), purityPercentage: new Prisma.Decimal(99.1), storageTemperatureC: new Prisma.Decimal(-20), storagePressureBar: new Prisma.Decimal(18), locationLat: new Prisma.Decimal(22.3072), locationLng: new Prisma.Decimal(73.1812) },
    });
    const batchB = await prisma.batch.create({
      data: { batchNumber: `B-B-${timestamp}`, sellerId: sellerB.id, capturedQuantity: new Prisma.Decimal(200), availableQuantity: new Prisma.Decimal(0), purityPercentage: new Prisma.Decimal(99.2), storageTemperatureC: new Prisma.Decimal(-20), storagePressureBar: new Prisma.Decimal(18), locationLat: new Prisma.Decimal(21.6264), locationLng: new Prisma.Decimal(73.0033) },
    });
    const batchC = await prisma.batch.create({
      data: { batchNumber: `B-C-${timestamp}`, sellerId: sellerC.id, capturedQuantity: new Prisma.Decimal(200), availableQuantity: new Prisma.Decimal(0), purityPercentage: new Prisma.Decimal(99.3), storageTemperatureC: new Prisma.Decimal(-20), storagePressureBar: new Prisma.Decimal(18), locationLat: new Prisma.Decimal(21.1702), locationLng: new Prisma.Decimal(72.8311) },
    });

    const order = await prisma.order.create({
      data: {
        orderNumber: `CB-ORD-COMPOSITE-${timestamp}`,
        orderType: OrderType.MULTI_SUPPLIER_COMPOSITE,
        buyerId: buyer.id,
        totalQuantity: new Prisma.Decimal(500),
        totalPrice: new Prisma.Decimal(1150000),
        overallStatus: OrderOverallStatus.CONFIRMED,
      },
    });

    const allocA = await prisma.allocation.create({ data: { orderId: order.id, batchId: batchA.id, sellerId: sellerA.id, allocatedQuantity: new Prisma.Decimal(100), pricePerTon: new Prisma.Decimal(2300) } });
    const allocB = await prisma.allocation.create({ data: { orderId: order.id, batchId: batchB.id, sellerId: sellerB.id, allocatedQuantity: new Prisma.Decimal(200), pricePerTon: new Prisma.Decimal(2300) } });
    const allocC = await prisma.allocation.create({ data: { orderId: order.id, batchId: batchC.id, sellerId: sellerC.id, allocatedQuantity: new Prisma.Decimal(200), pricePerTon: new Prisma.Decimal(2300) } });

    await prisma.shipment.create({ data: { orderId: order.id, allocationId: allocA.id, sellerId: sellerA.id, buyerId: buyer.id, individualStatus: ShipmentIndividualStatus.ALLOCATED, originLat: new Prisma.Decimal(22.3072), originLng: new Prisma.Decimal(73.1812), destinationLat: new Prisma.Decimal(23.0225), destinationLng: new Prisma.Decimal(72.5714) } });
    await prisma.shipment.create({ data: { orderId: order.id, allocationId: allocB.id, sellerId: sellerB.id, buyerId: buyer.id, individualStatus: ShipmentIndividualStatus.IN_TRANSIT, originLat: new Prisma.Decimal(21.6264), originLng: new Prisma.Decimal(73.0033), destinationLat: new Prisma.Decimal(23.0225), destinationLng: new Prisma.Decimal(72.5714) } });
    await prisma.shipment.create({ data: { orderId: order.id, allocationId: allocC.id, sellerId: sellerC.id, buyerId: buyer.id, individualStatus: ShipmentIndividualStatus.DELIVERED, originLat: new Prisma.Decimal(21.1702), originLng: new Prisma.Decimal(72.8311), destinationLat: new Prisma.Decimal(23.0225), destinationLng: new Prisma.Decimal(72.5714) } });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: buyerUser.email,
      password: 'CarbonBridge2026!',
    });
    const token = loginRes.body.data.tokens.accessToken;

    const res = await request(app)
      .get('/api/v1/maps/active')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.activeRunsCount).toBe(3);
    expect(data.totalAllocatedTonnage).toBe(500);

    // Every single route must terminate at the exact same Ahmedabad destination coordinates
    data.routes.forEach((r: any) => {
      expect(r.destination.city).toBe('Ahmedabad');
      expect(r.destination.latitude).toBeCloseTo(23.0225, 3);
      expect(r.destination.longitude).toBeCloseTo(72.5714, 3);
    });
  });

  it('TEST 5: Coordinates and destination remain authoritative and consistent on repeat reload', async () => {
    const { token } = await setupBuyerWithShipment('Ahmedabad, Gujarat', 20.59, 78.96, 'Ahmedabad', 23.0225, 72.5714);

    const res1 = await request(app).get('/api/v1/maps/active').set('Authorization', `Bearer ${token}`);
    const res2 = await request(app).get('/api/v1/maps/active').set('Authorization', `Bearer ${token}`);

    expect(res1.body.data.destination.latitude).toEqual(res2.body.data.destination.latitude);
    expect(res1.body.data.destination.longitude).toEqual(res2.body.data.destination.longitude);
    expect(res1.body.data.destination.city).toBe('Ahmedabad');
  });

  it('TEST 6: Coordinate resolver helper handles normalization, aliases, and rejects bogus centroid', () => {
    // Normalization and case insensitivity
    const ahmedabad1 = resolveLocationCoordinates('ahmedabad');
    expect(ahmedabad1.city).toBe('Ahmedabad');
    expect(ahmedabad1.latitude).toBeCloseTo(23.0225, 3);
    expect(ahmedabad1.longitude).toBeCloseTo(72.5714, 3);

    // Typo / alias
    const ahmedabad2 = resolveLocationCoordinates('ahmedaba, gujarat');
    expect(ahmedabad2.city).toBe('Ahmedabad');
    expect(ahmedabad2.latitude).toBeCloseTo(23.0225, 3);

    // Bogus central India coordinates with city name are overridden
    const bogusFixed = resolveLocationCoordinates('ahmedaba, gujarat', 20.59, 78.96);
    expect(bogusFixed.city).toBe('Ahmedabad');
    expect(bogusFixed.latitude).toBeCloseTo(23.0225, 3);
    expect(bogusFixed.longitude).toBeCloseTo(72.5714, 3);
    expect(bogusFixed.isAuthoritative).toBe(true);

    // Rajkot
    const rajkot = resolveLocationCoordinates('rajkot');
    expect(rajkot.city).toBe('Rajkot');
    expect(rajkot.latitude).toBeCloseTo(22.3039, 3);

    // Vadodara
    const vadodara = resolveLocationCoordinates('vadodara');
    expect(vadodara.city).toBe('Vadodara');
    expect(vadodara.latitude).toBeCloseTo(22.3072, 3);

    // Surat
    const surat = resolveLocationCoordinates('surat');
    expect(surat.city).toBe('Surat');
    expect(surat.latitude).toBeCloseTo(21.1702, 3);
  });
});
