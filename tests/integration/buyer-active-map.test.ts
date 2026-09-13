import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/prisma.js';
import { Role, CompanyType, ShipmentIndividualStatus, OrderType, OrderOverallStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

describe('Buyer Active Transaction Map Integration Suite', () => {
  let buyerToken: string;
  let buyerCompanyId: string;
  let otherBuyerToken: string;
  let otherBuyerCompanyId: string;
  let shipmentCId: string;

  beforeAll(async () => {
    const timestamp = Date.now();
    const passwordHash = await bcrypt.hash('CarbonBridge2026!', 10);

    // 1. Create Target Buyer Company (e.g. in Ahmedabad)
    const buyerCompany = await prisma.company.create({
      data: {
        name: `Sun Pharma SynFuels ${timestamp}`,
        companyType: CompanyType.OFFTAKER,
        registrationNumber: `REG-BUYER-${timestamp}`,
        address: 'Plot 45, GIDC Naroda Industrial Area, Ahmedabad, Gujarat',
        latitude: 23.0734,
        longitude: 72.6582,
      },
    });
    buyerCompanyId = buyerCompany.id;

    // Create Buyer User
    const buyerUser = await prisma.user.create({
      data: {
        email: `buyer.map.${timestamp}@sunpharma.com`,
        passwordHash,
        fullName: 'Dr. Vikram Patel',
        role: Role.BUYER,
        companyId: buyerCompanyId,
      },
    });

    const buyerLogin = await request(app).post('/api/v1/auth/login').send({
      email: buyerUser.email,
      password: 'CarbonBridge2026!',
    });
    buyerToken = buyerLogin.body.data.tokens.accessToken;

    // 2. Create Another Buyer (for isolation verification)
    const otherCompany = await prisma.company.create({
      data: {
        name: `Other Offtaker ${timestamp}`,
        companyType: CompanyType.OFFTAKER,
        registrationNumber: `REG-OTHER-${timestamp}`,
        address: 'Sector 25, Gandhinagar, Gujarat',
        latitude: 23.2156,
        longitude: 72.6369,
      },
    });
    otherBuyerCompanyId = otherCompany.id;

    const otherUser = await prisma.user.create({
      data: {
        email: `other.buyer.${timestamp}@offtaker.com`,
        passwordHash,
        fullName: 'Other Buyer',
        role: Role.BUYER,
        companyId: otherBuyerCompanyId,
      },
    });

    const otherLogin = await request(app).post('/api/v1/auth/login').send({
      email: otherUser.email,
      password: 'CarbonBridge2026!',
    });
    otherBuyerToken = otherLogin.body.data.tokens.accessToken;

    // 3. Create 3 Distinct Sellers:
    // Seller A: Vadodara (22.3072, 73.1812)
    const sellerA = await prisma.company.create({
      data: {
        name: `Gujarat Fluro Carbon ${timestamp}`,
        companyType: CompanyType.EMITTER,
        registrationNumber: `REG-SELLER-A-${timestamp}`,
        address: 'Ranoli Industrial Area, Vadodara, Gujarat',
        latitude: 22.3789,
        longitude: 73.1287,
      },
    });
    const batchA = await prisma.batch.create({
      data: {
        batchNumber: `CB-VAD-${timestamp}-A`,
        sellerId: sellerA.id,
        capturedQuantity: 500,
        availableQuantity: 400,
        allocatedQuantity: 100,
        purityPercentage: 99.8,
        storagePressureBar: 18,
        storageTemperatureC: -20,
        locationLat: sellerA.latitude!,
        locationLng: sellerA.longitude!,
      },
    });

    // Seller B: Bharuch / Ankleshwar (21.6264, 73.0033)
    const sellerB = await prisma.company.create({
      data: {
        name: `Narmada Clean CO2 Ltd ${timestamp}`,
        companyType: CompanyType.EMITTER,
        registrationNumber: `REG-SELLER-B-${timestamp}`,
        address: 'GIDC Phase 2, Ankleshwar, Gujarat',
        latitude: 21.6264,
        longitude: 73.0033,
      },
    });
    const batchB = await prisma.batch.create({
      data: {
        batchNumber: `CB-ANK-${timestamp}-B`,
        sellerId: sellerB.id,
        capturedQuantity: 500,
        availableQuantity: 300,
        allocatedQuantity: 200,
        purityPercentage: 99.5,
        storagePressureBar: 20,
        storageTemperatureC: -18,
        locationLat: sellerB.latitude!,
        locationLng: sellerB.longitude!,
      },
    });

    // Seller C: Surat (21.1702, 72.8311)
    const sellerC = await prisma.company.create({
      data: {
        name: `Hazira Petro-Captures ${timestamp}`,
        companyType: CompanyType.EMITTER,
        registrationNumber: `REG-SELLER-C-${timestamp}`,
        address: 'Hazira Industrial Zone, Surat, Gujarat',
        latitude: 21.1412,
        longitude: 72.6734,
      },
    });
    const batchC = await prisma.batch.create({
      data: {
        batchNumber: `CB-HAZ-${timestamp}-C`,
        sellerId: sellerC.id,
        capturedQuantity: 600,
        availableQuantity: 400,
        allocatedQuantity: 200,
        purityPercentage: 98.9,
        storagePressureBar: 22,
        storageTemperatureC: -22,
        locationLat: sellerC.latitude!,
        locationLng: sellerC.longitude!,
      },
    });

    // 4. Create Master Multi-Supplier Order: 500T total
    // Seller A -> 100T (status: ALLOCATED)
    // Seller B -> 200T (status: IN_TRANSIT)
    // Seller C -> 200T (status: DELIVERED)
    const order = await prisma.order.create({
      data: {
        orderNumber: `CB-ORD-MAP-${timestamp}`,
        orderType: OrderType.MULTI_SUPPLIER_COMPOSITE,
        buyerId: buyerCompanyId,
        totalQuantity: 500,
        totalPrice: 2250000,
        overallStatus: OrderOverallStatus.IN_FULFILLMENT,
      },
    });

    // Allocation & Shipment A
    const allocA = await prisma.allocation.create({
      data: {
        orderId: order.id,
        batchId: batchA.id,
        sellerId: sellerA.id,
        allocatedQuantity: 100,
        pricePerTon: 4500,
      },
    });
    await prisma.shipment.create({
      data: {
        orderId: order.id,
        allocationId: allocA.id,
        sellerId: sellerA.id,
        buyerId: buyerCompanyId,
        individualStatus: ShipmentIndividualStatus.ALLOCATED,
        originLat: sellerA.latitude!,
        originLng: sellerA.longitude!,
        destinationLat: buyerCompany.latitude!,
        destinationLng: buyerCompany.longitude!,
        trackingNotes: 'Allocated from Vadodara depot.',
      },
    });

    // Allocation & Shipment B
    const allocB = await prisma.allocation.create({
      data: {
        orderId: order.id,
        batchId: batchB.id,
        sellerId: sellerB.id,
        allocatedQuantity: 200,
        pricePerTon: 4450,
      },
    });
    await prisma.shipment.create({
      data: {
        orderId: order.id,
        allocationId: allocB.id,
        sellerId: sellerB.id,
        buyerId: buyerCompanyId,
        individualStatus: ShipmentIndividualStatus.IN_TRANSIT,
        originLat: sellerB.latitude!,
        originLng: sellerB.longitude!,
        destinationLat: buyerCompany.latitude!,
        destinationLng: buyerCompany.longitude!,
        dispatchedAt: new Date(),
        trackingNotes: 'Cryogenic tanker GJ-06-XX dispatched.',
      },
    });

    // Allocation & Shipment C
    const allocC = await prisma.allocation.create({
      data: {
        orderId: order.id,
        batchId: batchC.id,
        sellerId: sellerC.id,
        allocatedQuantity: 200,
        pricePerTon: 4600,
      },
    });
    const shipC = await prisma.shipment.create({
      data: {
        orderId: order.id,
        allocationId: allocC.id,
        sellerId: sellerC.id,
        buyerId: buyerCompanyId,
        individualStatus: ShipmentIndividualStatus.DELIVERED,
        originLat: sellerC.latitude!,
        originLng: sellerC.longitude!,
        destinationLat: buyerCompany.latitude!,
        destinationLng: buyerCompany.longitude!,
        dispatchedAt: new Date(Date.now() - 3600000 * 5),
        deliveredAt: new Date(),
        trackingNotes: 'Delivered at Naroda site manifold.',
      },
    });
    shipmentCId = shipC.id;
  });

  it('1. GET /api/v1/maps/active returns all 3 active suppliers with road geometry', async () => {
    const res = await request(app)
      .get('/api/v1/maps/active')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;

    // Total counts
    expect(data.activeRunsCount).toBe(3);
    expect(data.totalAllocatedTonnage).toBe(500);
    expect(data.suppliersCount).toBe(3);
    expect(data.routes).toHaveLength(3);

    // Verify each route has seller, buyer, quantity, status, and road geometry
    const routeA = data.routes.find((r: any) => r.allocatedTonnage === 100);
    expect(routeA).toBeDefined();
    expect(routeA.status).toBe('ALLOCATED');
    expect(routeA.batchNumber).toContain('CB-VAD');
    expect(routeA.seller.name).toContain('Gujarat Fluro Carbon');
    expect(routeA.destination.name).toContain('Sun Pharma SynFuels');
    expect(routeA.distanceKm).toBeGreaterThan(0);
    expect(routeA.durationHours).toBeGreaterThan(0);
    expect(routeA.geometry.length).toBeGreaterThan(1);
    expect(routeA).toHaveProperty('isRoadRoute');
    expect(routeA).toHaveProperty('routingProvider');

    const routeB = data.routes.find((r: any) => r.status === 'IN_TRANSIT');
    expect(routeB).toBeDefined();
    expect(routeB.allocatedTonnage).toBe(200);
    expect(routeB.seller.name).toContain('Narmada Clean');
    expect(routeB.geometry.length).toBeGreaterThan(1);

    const routeC = data.routes.find((r: any) => r.status === 'DELIVERED');
    expect(routeC).toBeDefined();
    expect(routeC.allocatedTonnage).toBe(200);
    expect(routeC.seller.name).toContain('Hazira Petro-Captures');
    expect(routeC.geometry.length).toBeGreaterThan(1);
  });

  it('2. Marking shipment as RECEIVED removes it from the Active Map', async () => {
    // Mark Seller C's shipment as RECEIVED
    await prisma.shipment.update({
      where: { id: shipmentCId },
      data: {
        individualStatus: ShipmentIndividualStatus.RECEIVED,
        receivedAt: new Date(),
      },
    });

    const res = await request(app)
      .get('/api/v1/maps/active')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    const data = res.body.data;

    // Active runs dropped from 3 to 2
    expect(data.activeRunsCount).toBe(2);
    expect(data.totalAllocatedTonnage).toBe(300);
    expect(data.suppliersCount).toBe(2);
    expect(data.routes).toHaveLength(2);

    // Confirm Seller C is no longer in active routes
    const hasSellerC = data.routes.some((r: any) => r.shipmentId === shipmentCId);
    expect(hasSellerC).toBe(false);

    // Confirm Seller A and Seller B remain visible
    const remainingStatuses = data.routes.map((r: any) => r.status);
    expect(remainingStatuses).toContain('ALLOCATED');
    expect(remainingStatuses).toContain('IN_TRANSIT');
  });

  it('3. Multi-tenant security: other buyer cannot see this buyer shipments', async () => {
    const res = await request(app)
      .get('/api/v1/maps/active')
      .set('Authorization', `Bearer ${otherBuyerToken}`);

    expect(res.status).toBe(200);
    const data = res.body.data;

    // Other buyer has 0 active runs
    expect(data.activeRunsCount).toBe(0);
    expect(data.routes).toHaveLength(0);
  });
});
