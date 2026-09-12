# CarbonBridge

CarbonBridge is an intelligent B2B CO₂ marketplace connecting industrial captured CO₂ suppliers (point-source emitters) with utilization buyers (e-fuels, precast concrete, green chemicals, greenhouses).

```
Discover → Match → Price → Bid/Buy → Allocate → Optimize Logistics → Track → Deliver
```

---

## Table of Contents

- [Overview](#overview)
- [Problem Being Solved](#problem-being-solved)
- [Main Features](#main-features)
  - [Buyer Capabilities](#buyer-capabilities)
  - [Seller Capabilities](#seller-capabilities)
  - [Smart CO₂ Matching & Multi-Supplier Pooling](#smart-co-matching--multi-supplier-pooling)
  - [Fixed-Price & English Auction Listings](#fixed-price--english-auction-listings)
  - [Deterministic Advisory Pricing](#deterministic-advisory-pricing)
  - [Batch Integrity & Concurrency Protection](#batch-integrity--concurrency-protection)
  - [Certificate of Analysis (CoA) Verification](#certificate-of-analysis-coa-verification)
  - [Active Transaction Map & Route Consolidation](#active-transaction-map--route-consolidation)
  - [Shipment Lifecycle Tracking](#shipment-lifecycle-tracking)
  - [In-App Notifications & Profile Management](#in-app-notifications--profile-management)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Database Models (Prisma)](#database-models-prisma)
- [API Documentation](#api-documentation)
- [Local Setup & Installation](#local-setup--installation)
- [Testing](#testing)

---

## Overview

Industrial decarbonization relies heavily on **Carbon Capture, Utilization, and Storage (CCUS)**. However, physical transactions between carbon capture facilities and industrial utilization plants are currently fragmented by bilateral negotiations, opaque pricing, purity mismatch risks, and complex cryogenic transport logistics.

**CarbonBridge** resolves these operational bottlenecks by providing a transactional platform for verified CO₂ lots, combining dynamic supply matching, multi-supplier volume aggregation, real-time English auctions, cryogenic logistics optimization, and automated custody-transfer tracking.

---

## Problem Being Solved

1. **Supply-Demand Fragmentation:** Small and medium emitters cannot independently satisfy large industrial off-taker purchase volumes.
2. **Purity Sensitivity:** Utilization processes (e.g. food/beverage vs synfuels vs mineral carbonation) require distinct minimum purity levels (75% to 99.9%).
3. **Logistics & Cryogenic Freight Overhead:** Liquefied CO₂ transport incurs substantial per-km freight costs; suboptimal single-drop routing wastes mileage and increases transit emissions.
4. **Phantom Inventory & Race Conditions:** Concurrent purchase requests without database concurrency controls risk over-allocating physical tank inventory.
5. **Quality Verification:** Off-takers require verified chemical assay composition (Certificate of Analysis) prior to lot acceptance.

---

## Main Features

### Buyer Capabilities
- **Post CO₂ Requirements:** Configure monthly demand by required volume (metric tonnes), minimum purity threshold, and destination coordinates.
- **Marketplace Browsing:** Filter verified active listings by selling method (Fixed-Price vs Auction), purity, available quantity, and landed price.
- **Smart Sourcing Engine:** Instant scoring of single-supplier matches and combinatorial multi-supplier composite proposals.
- **Direct Procurement & Auction Bidding:** Immediate purchase of fixed-price lots or live upward bidding on open English auctions with increment validation.
- **Shipment Confirmation:** Monitor in-transit cryogenic consignments and confirm delivery on site (`RECEIVED` state).

### Seller Capabilities
- **Batch Registration:** Register captured CO₂ batches with purity percentage, storage pressure (bar), and temperature (°C), automatically geo-tagged to facility location.
- **Flexible Monetization:** Create fixed-price or upward English auction listings from registered batches.
- **Batch Inventory Dashboard:** Real-time visibility into captured, allocated, and unallocated available inventory.
- **CoA Document Management:** Upload, inspect, and link lab-certified Certificate of Analysis PDFs to individual batches.
- **Order Fulfillment & Dispatch:** Progress consignments through structured dispatch milestones.

### Smart CO₂ Matching & Multi-Supplier Pooling
- Ranks candidate lots across:
  - **Quantity fit** (exact volume or closest lot sizing)
  - **Purity compatibility** ($\text{Purity} \ge \text{Buyer Minimum}$)
  - **Spatial proximity** (Haversine distance between emitter and off-taker facilities)
  - **Advisory landed price economics** (lot cost + cryogenic road transit)
- **Multi-Supplier Pooling:** If no single emitter meets buyer requirements, the platform synthesizes composite supply solutions (e.g. $100\text{T} + 200\text{T} + 200\text{T} = 500\text{T}$).

### Fixed-Price & English Auction Listings
- **Fixed-Price:** Instant spot-market purchasing with real-time atomic inventory deduction.
- **Seller-Side English Auctions:** Time-bounded auctions with reserve price, dynamic highest bid tracking, minimum increment validation, and scheduled finalization.
- Self-bidding and bidding on expired auctions are hard-blocked on both client and server.

### Deterministic Advisory Pricing
- Transparent rule-based price recommendations based on:
  - Capture technology baseline tiers (Post-Combustion, Pre-Combustion, Oxy-Fuel, DAC)
  - Purity tier adjustments (premium for ultra-pure food/beverage or catalyst grades)
  - Bulk order volume tier discounts
  - Landed cryogenic logistics freight estimates

### Batch Integrity & Concurrency Protection
- Enforces the strict mathematical invariant at all times:
  $$\text{Available Quantity} = \text{Captured Quantity} - \text{Allocated Quantity} \ge 0$$
- Creating a listing exposes quantity without consuming inventory.
- Allocations occur only upon explicit purchase or auction settlement using atomic PostgreSQL conditional checks to prevent race conditions and over-allocation.

### Certificate of Analysis (CoA) Verification
- Secure PDF upload with MIME validation, magic-byte inspection (`%PDF-`), and file size limits.
- Batches display verification status (`CERTIFICATE_AVAILABLE`).

### Active Transaction Map & Route Consolidation
- **Active Interactive Map:** Built with Leaflet, visualizing facility locations, active allocation routes, and transit lines. Completed deliveries auto-drop upon confirmation.
- **Route Consolidation:** Dynamically compares independent point-to-point round trips against consolidated multi-drop delivery loops for neighboring off-takers, calculating actual km and cost savings.

### Shipment Lifecycle Tracking
- Every individual lot within an order progresses through a 5-stage state machine:
  $$\text{ALLOCATED} \longrightarrow \text{DISPATCH\_PENDING} \longrightarrow \text{IN\_TRANSIT} \longrightarrow \text{DELIVERED} \longrightarrow \text{RECEIVED}$$
- Parent orders update aggregate status based on children status.

### In-App Notifications & Profile Management
- **Notifications:** Real-time in-app alerts for purchases, bids, auction closures, outbids, and shipment milestones with unread counters.
- **Enterprise Profile:** Dedicated `/profile` route accessible from the sidebar. Users can view identity, organization, and facility credentials, and perform live updates to full name, company name, and company location.

---

## Technology Stack

### Backend
- **Runtime:** Node.js (v20+ recommended)
- **Language:** TypeScript (strict mode, target ES2022)
- **Framework:** Express.js 4
- **ORM / Database Access:** Prisma ORM 5
- **Primary Database:** PostgreSQL 16
- **Caching & Rate Limiting:** Redis 7 (with transparent `ioredis-mock` fallback for zero-dependency local runs)
- **Validation:** Zod (runtime request schema enforcement)
- **Security:** Helmet, CORS, Argon2/bcryptjs password hashing, JWT access & refresh tokens
- **Logging:** Pino structured logging with HTTP request serialization
- **API Documentation:** Swagger UI Express / OpenAPI 3.0

### Frontend
- **Framework:** React 19 (SPA)
- **Build Tool:** Vite 8
- **Language:** JavaScript / JSX
- **Routing:** React Router v7
- **Mapping:** Leaflet 1.9
- **Styling:** Vanilla CSS design system (forest green & off-white responsive aesthetics)

### Testing & Tooling
- **Test Framework:** Vitest (96 automated unit, integration, and concurrency tests)
- **API Testing:** Supertest
- **Linter:** Oxlint (frontend)
- **Containerization:** Docker & Docker Compose

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React + Vite SPA                     │
│    (Leaflet Map, Dashboard, Auctions, Inventory, Profile)│
└────────────────────────────┬────────────────────────────┘
                             │ HTTPS / JSON REST API
                             ▼
┌─────────────────────────────────────────────────────────┐
│                  Express.js API Layer                   │
│   (Auth, Rate Limiters, Zod Validators, Audit Logging)   │
└──────────────┬───────────────────────────┬──────────────┘
               │                           │
               ▼                           ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│        Prisma ORM        │  │     Redis (Optional)     │
│   (Strict Transactions)  │  │  (Rate Limit & Job Cache) │
└──────────────┬───────────┘  └──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│                 PostgreSQL 16 Database                  │
│       • Source of truth for transactional inventory     │
│       • Decimal(14,4) precision for CO₂ tonnages        │
│       • Atomic condition: Available = Captured - Alloc   │
└─────────────────────────────────────────────────────────┘
```

---

## Database Models (Prisma)

The application schema ([`prisma/schema.prisma`](prisma/schema.prisma)) includes:

| Model | Purpose |
|---|---|
| **Company** | Emitter, Off-taker, or Admin corporate entity with verified geo-coordinates, tax ID, and address. |
| **User** | Authenticated team members belonging to a Company (`BUYER`, `SELLER`, `ADMIN`). |
| **Batch** | Physical lot of captured CO₂ with tonnages (`captured`, `allocated`, `available`), purity, pressure, and temperature. |
| **Listing** | Commercial offer linking a batch to a selling method (`FIXED_PRICE` or `AUCTION`) and price/reserve. |
| **Requirement** | Off-taker procurement demand specifying volume needed, purity floor, and target delivery coordinates. |
| **Auction** | English auction engine record managing reserve prices, closing deadlines, and highest bids. |
| **Bid** | Timestamped monetary offers placed by verified buyers on open auctions. |
| **Order** | Single-seller or composite procurement contract holding aggregate financial and tonnage terms. |
| **Allocation** | Child allocation lot locking batch tonnage to an order. |
| **Shipment** | Cryogenic logistics consignment tracking individual dispatch-to-receipt transitions. |
| **CertificateOfAnalysis** | Chemical assay certification PDF attachment linked to a physical batch. |
| **Notification** | User alert notifications with read/unread flags. |
| **AuditEvent** | Tamper-evident audit trail capturing critical user, batch, and financial events. |
| **IdempotencyKey** | Protection against duplicate API submissions on mutating endpoints. |

---

## API Documentation

Interactive Swagger documentation is available locally when the backend is running:

- **Swagger UI:** [http://localhost:4000/api/docs](http://localhost:4000/api/docs)
- **OpenAPI JSON Spec:** [http://localhost:4000/api/docs.json](http://localhost:4000/api/docs.json)

### Major API Endpoint Groups

| Module | Route Prefix | Description |
|---|---|---|
| **Auth** | `/api/v1/auth` | User registration, authentication, JWT refresh, and session status. |
| **Users / Profile** | `/api/v1/users` | `GET /me` and `PATCH /me` for profile and company address updates. |
| **Batches** | `/api/v1/batches` | Seller batch registration, inventory listing, and allocation audits. |
| **Listings** | `/api/v1/listings` | Fixed-price and auction listing catalog and status management. |
| **Requirements** | `/api/v1/requirements` | Off-taker demand creation, modification, and status monitoring. |
| **Matching** | `/api/v1/matching` | Single-lot and multi-supplier combinatorial pooling engine. |
| **Pricing** | `/api/v1/pricing` | Deterministic advisory price corridor calculations. |
| **Auctions & Bids** | `/api/v1/auctions` | Open auctions, active bidding (`POST /:id/bid`), and settlement. |
| **Orders** | `/api/v1/orders` | Purchase order placement (`/purchase-now`) and multi-supplier fulfillment. |
| **Shipments** | `/api/v1/shipments` | Milestone transitions (`DISPATCH_PENDING` → `IN_TRANSIT` → `DELIVERED` → `RECEIVED`). |
| **Logistics** | `/api/v1/logistics` | Route consolidation distance & freight savings calculator. |
| **Maps** | `/api/v1/maps` | Active, undelivered logistics transit coordinates for Leaflet display. |
| **Documents** | `/api/v1/documents` | Multipart CoA PDF upload and download endpoints. |
| **Notifications** | `/api/v1/notifications` | User alert feed and unread badge count updates. |
| **Insights** | `/api/v1/insights` | Seller market opportunities and analytics. |

---

## Local Setup & Installation

### Prerequisites

- **Node.js** (v18.x or v20.x recommended)
- **npm** (v9+ or v10+)
- **PostgreSQL 16** (or Docker for containerized database)
- **Redis** (optional; backend automatically falls back to in-memory mock if Redis is absent)

---

### Step 1: Clone Repository

```bash
git clone https://github.com/zuhebkhan011/CARBONBRIDGE.git
cd CARBONBRIDGE
```

---

### Step 2: Install Dependencies

Install root backend dependencies:
```bash
npm install
```

Install frontend dependencies:
```bash
cd frontend
npm install
cd ..
```

---

### Step 3: Configure Environment Variables

Create your local `.env` file from `.env.example`:
```bash
cp .env.example .env
```

Configure your local database credentials in `.env`:
```env
PORT=4000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/CARBONBRIDGE?schema=public"
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your_super_secret_refresh_jwt_key_here
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173
UPLOAD_MAX_FILE_SIZE_MB=10
CRYO_FREIGHT_BASE_RATE_PER_KM=1.85
CRYO_TRANSIT_ESTIMATE_KM_PER_HOUR=45
```

---

### Step 4: Database Setup & Seeding

Generate the Prisma Client:
```bash
npm run prisma:generate
```

Apply database migrations:
```bash
npm run prisma:deploy
```
*(Or use `npm run prisma:migrate` during local development)*

Seed the database with realistic industrial CCUS suppliers, buyers, batches, and listings:
```bash
npm run prisma:seed
```

> **Default Seed Accounts (Password for all: `CarbonBridge2026!`):**
> - **Seller A (UltraTech):** `seller.a@ultratech.com`
> - **Seller B (Tata Steel):** `seller.b@tatasteel.com`
> - **Seller C (Linde):** `seller.c@linde.com`
> - **Buyer (SynFuels):** `buyer.synfuels@ahmedabad.com`
> - **Admin:** `admin@carbonbridge.internal`

---

### Step 5: Start the Application

#### Terminal 1 — Backend API
```bash
npm run dev
```
Backend API will start at: `http://localhost:4000` (Health check: `http://localhost:4000/health`)

#### Terminal 2 — Frontend Application
```bash
cd frontend
npm run dev
```
Frontend will start at: `http://localhost:5173`

---

### Docker Deployment (Alternative)

To run the complete stack (PostgreSQL + Redis + Backend) in Docker:
```bash
docker compose up --build
```

---

## Testing

The project includes an automated test suite verifying pricing rules, matching algorithms, auction bidding, inventory invariants, and concurrent allocation safety.

Run all tests:
```bash
npm test
```

Run concurrency and over-allocation protection tests:
```bash
npm run test:concurrency
```

Run backend typecheck:
```bash
npx tsc --noEmit
```

Build frontend production bundle:
```bash
cd frontend && npm run build
```

---

## License

ISC License. Built for **HackOut'26 — Problem Statement PS8** by Team **AESTRO**.
