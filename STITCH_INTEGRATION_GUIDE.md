# CarbonBridge REST API — Google Stitch Frontend Integration Guide

**Problem Statement PS8:** Carbon Capture-to-Product Matchmaking Platform  
**Team:** AESTRO  
**API Server:** `http://localhost:4000/api/v1`  
**Interactive Swagger UI:** `http://localhost:4000/api/docs`  
**OpenAPI Specification JSON:** `http://localhost:4000/api/docs.json`  

---

## 1. Quick Start & Server Endpoints

| Resource | URL | Description |
| :--- | :--- | :--- |
| **API Base URL** | `http://localhost:4000/api/v1` | Root endpoint for all v1 domain APIs |
| **Interactive Swagger UI** | `http://localhost:4000/api/docs` | Test any endpoint in-browser with live responses |
| **OpenAPI 3.0 JSON** | `http://localhost:4000/api/docs.json` | Import directly into Google Stitch or Postman |
| **Liveness Check** | `http://localhost:4000/health` | Service liveness probe (`{"status":"healthy"}`) |
| **Readiness Check** | `http://localhost:4000/ready` | Database connectivity probe (`{"status":"ready"}`) |

> [!NOTE]
> **CORS is Pre-Configured (`*`):**  
> Any port or local host running your Google Stitch frontend can immediately call the backend without CORS or proxy errors.

---

## 2. Pre-Seeded Demo Enterprise Accounts

You can log in immediately using any of the following accounts:

| Persona | Email | Password | Role | Organization & Location |
| :--- | :--- | :--- | :--- | :--- |
| **Seller A** | `seller.a@ultratech.com` | `CarbonBridge2026!` | `SELLER` | UltraTech Cement (Ankleshwar: 100T captured @ 78% purity) |
| **Seller B** | `seller.b@tatasteel.com` | `CarbonBridge2026!` | `SELLER` | Tata Steel (Hazira: 200T captured @ 72% purity) |
| **Seller C** | `seller.c@reliance.com` | `CarbonBridge2026!` | `SELLER` | Reliance Petrochemicals (Dahej: 200T captured @ 74% purity) |
| **Buyer** | `buyer.synfuels@ahmedabad.com` | `CarbonBridge2026!` | `BUYER` | Gujarat SynFuels (Ahmedabad: Demand for 500T @ min 70% purity) |
| **Admin** | `admin@carbonbridge.io` | `CarbonBridgeAdmin2026!`| `ADMIN` | CarbonBridge Governance Ops |

---

## 3. Authentication & Request Headers

### Login Request:
```http
POST /api/v1/auth/login HTTP/1.1
Host: localhost:4000
Content-Type: application/json

{
  "email": "buyer.synfuels@ahmedabad.com",
  "password": "CarbonBridge2026!"
}
```

### Response:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "u-uuid",
      "email": "buyer.synfuels@ahmedabad.com",
      "fullName": "Pooja Iyer (Procurement VP)",
      "role": "BUYER",
      "companyId": "comp-uuid"
    },
    "tokens": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "eyJhbGciOi..."
    }
  }
}
```

### Authenticated Requests:
Pass the access token in the `Authorization` header:
```http
Authorization: Bearer <accessToken>
```

### Idempotency Support:
On financial or allocation write endpoints (`/api/v1/orders/procure-fixed`, `/api/v1/orders/procure-composite`), send an optional `Idempotency-Key` header (e.g. UUID) to prevent duplicate transactions on network retries:
```http
Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
```

---

## 4. Key End-to-End Workflows

### Workflow 1: Buyer Demand & Smart Multi-Supplier Matching

#### 1. Post Industrial Requirement (`POST /api/v1/requirements`)
```json
{
  "targetQuantity": 500.0,
  "minPurity": 70.0,
  "deliveryLat": 23.0225,
  "deliveryLng": 72.5714,
  "deliveryAddress": "Sanand Industrial Estate, Ahmedabad, Gujarat",
  "requiredDeliveryDate": "2026-10-30T00:00:00.000Z",
  "budgetCeilingPerTon": 3200.0,
  "intendedApplication": "Synthetic Aviation Fuels (e-kerosene) production"
}
```

#### 2. Get Smart Matches (`GET /api/v1/matching/{requirementId}`)
Returns both single-supplier matches and multi-supplier volume pooling:
```json
{
  "success": true,
  "data": {
    "requirementId": "req-uuid",
    "targetQuantity": 500,
    "minPurity": 70,
    "singleSupplierMatches": [],
    "multiSupplierMatches": [
      {
        "matchType": "MULTI_SUPPLIER_COMPOSITE",
        "proposalId": "proposal-uuid",
        "totalFulfilledQuantity": 500,
        "fulfillmentPercentage": 100,
        "weightedAveragePurity": 74.0,
        "contributingLots": [
          {
            "sellerName": "UltraTech Cement",
            "batchNumber": "CB-BATCH-2026-001",
            "contributingQuantity": 100,
            "purityPercentage": 78.0,
            "pricePerTon": 2400,
            "distanceKm": 160.45,
            "landedCostPerTon": 2696.83
          },
          {
            "sellerName": "Tata Steel",
            "batchNumber": "CB-BATCH-2026-002",
            "contributingQuantity": 200,
            "purityPercentage": 72.0,
            "pricePerTon": 2350,
            "distanceKm": 212.18,
            "landedCostPerTon": 2742.53
          },
          {
            "sellerName": "Reliance Petrochem",
            "batchNumber": "CB-BATCH-2026-003",
            "contributingQuantity": 200,
            "purityPercentage": 74.0,
            "pricePerTon": 2380,
            "distanceKm": 145.89,
            "landedCostPerTon": 2649.90
          }
        ],
        "totalProductCost": 1186000,
        "totalFreightCost": 166708,
        "totalLandedCost": 1352708,
        "averageLandedCostPerTon": 2705.42
      }
    ]
  }
}
```

#### 3. Procure Pooled Supply (`POST /api/v1/orders/procure-composite`)
```json
{
  "deliveryLat": 23.0225,
  "deliveryLng": 72.5714,
  "deliveryAddress": "Sanand Industrial Estate, Ahmedabad",
  "requirementId": "req-uuid",
  "allocations": [
    { "batchId": "batch-a-uuid", "listingId": "list-a-uuid", "quantity": 100 },
    { "batchId": "batch-b-uuid", "listingId": "list-b-uuid", "quantity": 200 },
    { "batchId": "batch-c-uuid", "listingId": "list-c-uuid", "quantity": 200 }
  ]
}
```

---

### Workflow 2: Seller Batch Registration & Certificate of Analysis (CoA)

#### 1. Register Batch (`POST /api/v1/batches`)
```json
{
  "batchNumber": "CB-BATCH-2026-005",
  "capturedQuantity": 300.0,
  "purityPercentage": 81.5,
  "storagePressureBar": 17.0,
  "storageTemperatureC": -21.0,
  "locationLat": 21.6264,
  "locationLng": 73.0033
}
```

#### 2. Create Listing (`POST /api/v1/listings`)
- Fixed Price: `{"batchId": "...", "sellingMethod": "FIXED_PRICE", "pricePerTon": 2450}`
- Auction: `{"batchId": "...", "sellingMethod": "AUCTION"}`

#### 3. Upload CoA (`POST /api/v1/documents/coa/upload`)
Form data containing:
- `file`: PDF document (validated against `%PDF-` signature)
- `batchId`: Target batch UUID
Listing immediately shows badge: `"Certificate Available"` / `"Certificate Uploaded"`.

---

### Workflow 3: Seller-Side English Auction & Bidding Console

#### 1. Launch Auction (`POST /api/v1/auctions`)
```json
{
  "listingId": "listing-uuid",
  "baseReservePrice": 2500,
  "minBidIncrement": 50,
  "closingTime": "2026-10-15T18:00:00.000Z"
}
```

#### 2. Place Upward Bid (`POST /api/v1/auctions/{id}/bid`)
```json
{
  "amountPerTon": 2650
}
```
*Note: Bid must be $\ge \text{currentHighestBid} + \text{minBidIncrement}$. Server timestamp guarantees no bids are accepted after closing.*

#### 3. Finalize Auction (`POST /api/v1/auctions/{id}/finalize`)
Awards batch atomically to highest bidder and creates parent Order and Shipment.

---

### Workflow 4: Shipment State Machine & Active Transaction Map

#### 1. View Active Map (`GET /api/v1/maps/active`)
Returns only active, undelivered runs:
```json
{
  "success": true,
  "data": {
    "activeRunsCount": 3,
    "scope": "BUYER_VIEW (Origins -> My Delivery Site)",
    "routes": [
      {
        "shipmentId": "shipment-uuid",
        "orderNumber": "CB-ORD-1001",
        "status": "ALLOCATED",
        "allocatedTonnage": 100,
        "purityPercentage": 78,
        "origin": { "name": "UltraTech Cement", "latitude": 21.6264, "longitude": 73.0033 },
        "destination": { "name": "Gujarat SynFuels", "latitude": 23.0225, "longitude": 72.5714 },
        "distanceKm": 160.45
      }
    ]
  }
}
```

#### 2. Advance Shipment State (`PATCH /api/v1/shipments/{id}/status`)
Progression path:
$$\text{ALLOCATED} \longrightarrow \text{DISPATCH\_PENDING} \longrightarrow \text{IN\_TRANSIT} \longrightarrow \text{DELIVERED} \longrightarrow \text{RECEIVED}$$

- **Seller advances transit:**
  ```json
  { "status": "IN_TRANSIT", "trackingNotes": "Cryo tanker CB-TK-09 departed loading bay." }
  ```
- **Buyer confirms custody transfer:**
  ```json
  { "status": "RECEIVED", "trackingNotes": "Custody accepted at Sanand gate." }
  ```
*As soon as a shipment reaches `RECEIVED`, it automatically drops off `GET /api/v1/maps/active`.*

---

### Workflow 5: Dynamic Route Consolidation Analyzer

#### Check Opportunities (`GET /api/v1/logistics/consolidation`)
Evaluates active shipments from ONE seller plant to multiple regional buyers:
```json
{
  "success": true,
  "data": {
    "activePendingShipmentsCount": 3,
    "consolidationOpportunityDetected": true,
    "metrics": {
      "independentSeparateTripsKm": 892.4,
      "consolidatedMultiDropLoopKm": 648.2,
      "distanceSavedKm": 244.2,
      "dynamicMileageSavingsPercentage": 27.36
    },
    "recommendation": "High consolidation efficiency: Bundling these 3 runs reduces cryogenic tanker empty-run deadheading by 27.36% (244.2 km saved)."
  }
}
```
*Note: The savings percentage is calculated dynamically based on actual coordinates. No static 28% constant is used.*

---

## 5. Consistent Error Response Format

When a request fails, the API returns a standardized JSON structure:

```json
{
  "success": false,
  "error": {
    "code": "BATCH_OVER_ALLOCATION",
    "message": "Allocation rejected: Batch 'CB-BATCH-2026-001' has insufficient available capacity. Requested: 150T, Current Available: 100T.",
    "details": null
  },
  "requestId": "4fae6f28-d88b-4976-9c47-386bfeb93049"
}
```

### Standard Error Codes:
- `VALIDATION_ERROR` (400) — Malformed request body, invalid coordinates, or invalid date
- `UNAUTHORIZED` (401) — Missing or expired Bearer token
- `FORBIDDEN` (403) — Role mismatch (e.g. Buyer attempting seller-only action) or accessing another company's records
- `NOT_FOUND` (404) — Entity does not exist
- `CONFLICT` (409) — Duplicate email/batch number or outbid race condition
- `BATCH_OVER_ALLOCATION` (409) — Attempted allocation exceeds available balance ($Available < Requested$)
- `INVALID_STATE_TRANSITION` (400) — Illegal jump in shipment lifecycle (e.g. `Allocated` $\rightarrow$ `Received`)
