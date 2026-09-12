import {
  PrismaClient,
  Role,
  CompanyType,
  BatchStatus,
  SellingMethod,
  ListingStatus,
  RequirementStatus,
  AuctionStatus,
  CoAStatus,
  Prisma,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting CarbonBridge Realistic Database Seeding...');

  // 1. Clean existing records in dependency order
  await prisma.notification.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.allocation.deleteMany();
  await prisma.order.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.auction.deleteMany();
  await prisma.certificateOfAnalysis.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.requirement.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();

  const defaultPasswordHash = await bcrypt.hash('CarbonBridge2026!', 10);

  // 2. Create Companies
  const companySellerA = await prisma.company.create({
    data: {
      name: 'UltraTech Cement Flue Gas Capture Plant',
      companyType: CompanyType.EMITTER,
      registrationNumber: 'CIN-GJ-EMITTER-001',
      latitude: new Prisma.Decimal('21.6264'),
      longitude: new Prisma.Decimal('73.0033'),
      address: 'Ankleshwar GIDC Industrial Cluster, Gujarat, India',
    },
  });

  const companySellerB = await prisma.company.create({
    data: {
      name: 'Tata Steel Carbon Mitigation Terminal',
      companyType: CompanyType.EMITTER,
      registrationNumber: 'CIN-GJ-EMITTER-002',
      latitude: new Prisma.Decimal('21.1167'),
      longitude: new Prisma.Decimal('72.6500'),
      address: 'Hazira Heavy Manufacturing Hub, Surat, Gujarat, India',
    },
  });

  const companySellerC = await prisma.company.create({
    data: {
      name: 'Reliance Petrochemical Gas Recovery Facility',
      companyType: CompanyType.EMITTER,
      registrationNumber: 'CIN-GJ-EMITTER-003',
      latitude: new Prisma.Decimal('21.7118'),
      longitude: new Prisma.Decimal('72.5855'),
      address: 'Dahej Petroleum & Chemical Zone, Bharuch, Gujarat, India',
    },
  });

  const companyBuyer = await prisma.company.create({
    data: {
      name: 'Gujarat SynFuels & E-Kerosene Consortium',
      companyType: CompanyType.OFFTAKER,
      registrationNumber: 'CIN-GJ-OFFTAKER-001',
      latitude: new Prisma.Decimal('23.0225'),
      longitude: new Prisma.Decimal('72.5714'),
      address: 'Sanand Industrial Estate, Ahmedabad, Gujarat, India',
    },
  });

  const companyAdmin = await prisma.company.create({
    data: {
      name: 'CarbonBridge Governance Org',
      companyType: CompanyType.ADMIN_ORG,
      registrationNumber: 'CIN-IN-ADMIN-001',
      latitude: new Prisma.Decimal('28.6139'),
      longitude: new Prisma.Decimal('77.2090'),
      address: 'New Delhi HQ, India',
    },
  });

  // 3. Create Users
  await prisma.user.create({
    data: {
      email: 'seller.a@ultratech.com',
      passwordHash: defaultPasswordHash,
      fullName: 'Vikram Mehta (Plant Ops)',
      role: Role.SELLER,
      companyId: companySellerA.id,
    },
  });

  await prisma.user.create({
    data: {
      email: 'seller.b@tatasteel.com',
      passwordHash: defaultPasswordHash,
      fullName: 'Ananya Deshmukh (Decarb Lead)',
      role: Role.SELLER,
      companyId: companySellerB.id,
    },
  });

  await prisma.user.create({
    data: {
      email: 'seller.c@reliance.com',
      passwordHash: defaultPasswordHash,
      fullName: 'Siddharth Patel (Terminal Lead)',
      role: Role.SELLER,
      companyId: companySellerC.id,
    },
  });

  const buyerUser = await prisma.user.create({
    data: {
      email: 'buyer.synfuels@ahmedabad.com',
      passwordHash: defaultPasswordHash,
      fullName: 'Pooja Iyer (Procurement VP)',
      role: Role.BUYER,
      companyId: companyBuyer.id,
    },
  });

  await prisma.user.create({
    data: {
      email: 'admin@carbonbridge.io',
      passwordHash: defaultPasswordHash,
      fullName: 'Antigravity System Admin',
      role: Role.ADMIN,
      companyId: companyAdmin.id,
    },
  });

  // 4. Create CO2 Batches (Matching demo: 100T + 200T + 200T = 500T)
  const batchA = await prisma.batch.create({
    data: {
      batchNumber: 'CB-BATCH-2026-001',
      sellerId: companySellerA.id,
      capturedQuantity: new Prisma.Decimal('100.0000'),
      allocatedQuantity: new Prisma.Decimal('0.0000'),
      availableQuantity: new Prisma.Decimal('100.0000'),
      purityPercentage: new Prisma.Decimal('78.00'),
      storagePressureBar: new Prisma.Decimal('16.50'),
      storageTemperatureC: new Prisma.Decimal('-22.00'),
      locationLat: companySellerA.latitude,
      locationLng: companySellerA.longitude,
      status: BatchStatus.ACTIVE,
    },
  });

  const batchB = await prisma.batch.create({
    data: {
      batchNumber: 'CB-BATCH-2026-002',
      sellerId: companySellerB.id,
      capturedQuantity: new Prisma.Decimal('200.0000'),
      allocatedQuantity: new Prisma.Decimal('0.0000'),
      availableQuantity: new Prisma.Decimal('200.0000'),
      purityPercentage: new Prisma.Decimal('72.00'),
      storagePressureBar: new Prisma.Decimal('18.00'),
      storageTemperatureC: new Prisma.Decimal('-20.00'),
      locationLat: companySellerB.latitude,
      locationLng: companySellerB.longitude,
      status: BatchStatus.ACTIVE,
    },
  });

  const batchC = await prisma.batch.create({
    data: {
      batchNumber: 'CB-BATCH-2026-003',
      sellerId: companySellerC.id,
      capturedQuantity: new Prisma.Decimal('200.0000'),
      allocatedQuantity: new Prisma.Decimal('0.0000'),
      availableQuantity: new Prisma.Decimal('200.0000'),
      purityPercentage: new Prisma.Decimal('74.00'),
      storagePressureBar: new Prisma.Decimal('15.50'),
      storageTemperatureC: new Prisma.Decimal('-24.00'),
      locationLat: companySellerC.latitude,
      locationLng: companySellerC.longitude,
      status: BatchStatus.ACTIVE,
    },
  });

  // Batch D for Auction demo
  const batchD = await prisma.batch.create({
    data: {
      batchNumber: 'CB-BATCH-2026-004',
      sellerId: companySellerA.id,
      capturedQuantity: new Prisma.Decimal('150.0000'),
      allocatedQuantity: new Prisma.Decimal('0.0000'),
      availableQuantity: new Prisma.Decimal('150.0000'),
      purityPercentage: new Prisma.Decimal('85.00'),
      storagePressureBar: new Prisma.Decimal('20.00'),
      storageTemperatureC: new Prisma.Decimal('-25.00'),
      locationLat: companySellerA.latitude,
      locationLng: companySellerA.longitude,
      status: BatchStatus.ACTIVE,
    },
  });

  // 5. Attach Certificates of Analysis (CoAs)
  await prisma.certificateOfAnalysis.createMany({
    data: [
      {
        batchId: batchA.id,
        fileName: 'SGS_Assay_UltraTech_CB001.pdf',
        fileUrl: `/api/v1/documents/coa/download/${batchA.id}`,
        fileSize: 245800,
        mimeType: 'application/pdf',
        status: CoAStatus.CERTIFICATE_UPLOADED,
      },
      {
        batchId: batchB.id,
        fileName: 'TUV_Nord_Analysis_Tata_CB002.pdf',
        fileUrl: `/api/v1/documents/coa/download/${batchB.id}`,
        fileSize: 312000,
        mimeType: 'application/pdf',
        status: CoAStatus.CERTIFICATE_AVAILABLE,
      },
      {
        batchId: batchC.id,
        fileName: 'BureauVeritas_Assay_Reliance_CB003.pdf',
        fileUrl: `/api/v1/documents/coa/download/${batchC.id}`,
        fileSize: 198400,
        mimeType: 'application/pdf',
        status: CoAStatus.CERTIFICATE_UPLOADED,
      },
    ],
  });

  // 6. Create Marketplace Listings
  await prisma.listing.create({
    data: {
      batchId: batchA.id,
      sellerId: companySellerA.id,
      sellingMethod: SellingMethod.FIXED_PRICE,
      pricePerTon: new Prisma.Decimal('2400.00'),
      status: ListingStatus.ACTIVE,
    },
  });

  await prisma.listing.create({
    data: {
      batchId: batchB.id,
      sellerId: companySellerB.id,
      sellingMethod: SellingMethod.FIXED_PRICE,
      pricePerTon: new Prisma.Decimal('2350.00'),
      status: ListingStatus.ACTIVE,
    },
  });

  await prisma.listing.create({
    data: {
      batchId: batchC.id,
      sellerId: companySellerC.id,
      sellingMethod: SellingMethod.FIXED_PRICE,
      pricePerTon: new Prisma.Decimal('2380.00'),
      status: ListingStatus.ACTIVE,
    },
  });

  const listingAuction = await prisma.listing.create({
    data: {
      batchId: batchD.id,
      sellerId: companySellerA.id,
      sellingMethod: SellingMethod.AUCTION,
      status: ListingStatus.ACTIVE,
    },
  });

  // 7. Launch Seller-Side Auction
  const auction = await prisma.auction.create({
    data: {
      listingId: listingAuction.id,
      batchId: batchD.id,
      sellerId: companySellerA.id,
      baseReservePrice: new Prisma.Decimal('2500.00'),
      currentHighestBid: new Prisma.Decimal('2600.00'),
      minBidIncrement: new Prisma.Decimal('50.00'),
      closingTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days in future
      status: AuctionStatus.OPEN,
    },
  });

  // Sample initial bid on auction
  await prisma.bid.create({
    data: {
      auctionId: auction.id,
      buyerId: buyerUser.id,
      amountPerTon: new Prisma.Decimal('2600.00'),
    },
  });

  // 8. Create Buyer Requirement for 500T (matches 100T + 200T + 200T)
  const requirement = await prisma.requirement.create({
    data: {
      buyerId: companyBuyer.id,
      targetQuantity: new Prisma.Decimal('500.0000'),
      minPurity: new Prisma.Decimal('70.00'),
      deliveryLat: companyBuyer.latitude,
      deliveryLng: companyBuyer.longitude,
      deliveryAddress: companyBuyer.address,
      requiredDeliveryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      budgetCeilingPerTon: new Prisma.Decimal('3200.00'),
      intendedApplication: 'Synthetic Aviation Fuels (e-kerosene) production',
      status: RequirementStatus.OPEN,
    },
  });

  console.log('✅ Seed data successfully inserted:');
  console.log('   - 3 Emitter Companies (Seller A: 100T, Seller B: 200T, Seller C: 200T)');
  console.log('   - 1 Off-Taker Buyer (Demand: 500T @ min 70% purity, Ahmedabad)');
  console.log('   - 3 Fixed-Price Listings & 1 Seller-Side Auction');
  console.log(`   - Demo Requirement ID: ${requirement.id}`);
  console.log('   - All passwords: CarbonBridge2026!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
