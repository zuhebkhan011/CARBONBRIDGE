# CarbonBridge ML Training Data

## Data Policy & Architecture

The CarbonBridge CO2 Price Prediction ML service predicts `pricePerTonne` (INR/T) for commercial CO2 transactions.

### Data Sourcing Hierarchy:
1. **Primary Source**: Real completed historical transactions from PostgreSQL:
   - Settled orders and allocations (`Allocation.pricePerTon`, `Order.overallStatus = 'DELIVERED' | 'RECEIVED' | 'CONFIRMED'`)
   - Settled auctions (`Auction.status = 'SETTLED'`, winning bid amount)
   - Excludes: cancelled orders, failed transactions, incomplete auctions, test records, invalid prices.

2. **Synthetic Demonstration Dataset**:
   - In development and early testing environments before high transaction volume accumulates in production, a dedicated synthetic dataset generator provides realistic commercial data.
   - **Explicit Label**: `SYNTHETIC TRAINING DATA — NOT REAL MARKET DATA`
   - Synthetic data incorporates industrial CCUS operating physics:
     - Baseline flue gas price: ₹2,200 – ₹2,500/T
     - Purity premiums for high-purity food/pharmaceutical grade (>90% purity)
     - Cryogenic freight distance penalty (e.g. ~₹1.85/T-km)
     - Volume scale discounts for bulk off-takers (>200T, >500T)
     - Regional supply/demand liquidity effects
   - Real and synthetic data are never combined without provenance tracking.
