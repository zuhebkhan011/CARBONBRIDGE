# CarbonBridge ML Price Prediction Service

The CarbonBridge ML Price Prediction Service is an independent, high-performance Python microservice powered by **FastAPI** and **XGBoost Regression** (`XGBRegressor`). It predicts optimal clearing and settlement prices for commercial CO₂ lots (`pricePerTonne` in INR/T) based on industrial CCUS purity, lot sizing, geographic freight distance, and active regional supply/demand liquidity.

---

## 1. Architectural Roles & Clear Distinctions

CarbonBridge provides three distinct, complementary pricing and intelligence layers:

| Layer | Technology | Primary Role | Fallback Behavior |
| :--- | :--- | :--- | :--- |
| **Rule-Based Pricing** | TypeScript / Deterministic | Grounded benchmark based on industrial flue gas baseline (₹2,200–₹2,500/T), hard purity thresholds, volume scales, and liquidity bands. | **Primary Baseline**: Never fails. Fully autonomous. |
| **ML Price Prediction** | Python / FastAPI / XGBoost | Non-linear regression estimating actual clearing prices from historical transactions, logistics distance, and multi-factor interactions. | **Graceful Fallback**: If ML is offline or data is insufficient, falls back to Rule-Based Pricing. |
| **Gemini AI Explanation** | Google GenAI / LLM | Qualitative commercial commentary, contextual negotiation tips, and narrative summaries for buyers and sellers. | **Advisory Only**: Does not compute financial figures. |

> [!IMPORTANT]
> The ML model is **strictly advisory**. It never automatically modifies seller asking prices, auction reserves, or transaction allocations. Sellers and buyers retain complete commercial autonomy.

---

## 2. Features & Target Variable

### Prediction Target
- **`pricePerTonne`**: Final settlement price in Indian Rupees (INR) per metric tonne.

### Feature Set
1. **`purity`** (*float, 50.0–100.0*): CO₂ assay percentage from Certificate of Analysis (CoA).
2. **`quantityTonnes`** (*float, > 0*): Volume offered in metric tonnes.
3. **`distanceKm`** (*float, >= 0*): Direct logistics road distance between capture facility and delivery site.
4. **`demandIndex`** (*float, >= 0*): Normalized regional buyer requirement demand index.
5. **`supplyIndex`** (*float, >= 0*): Normalized regional active available inventory supply index.
6. **`auctionAveragePrice`** (*float, >= 0*): Recent market average auction price in INR/T.
7. **`intendedUse_encoded`** (*integer*): Deterministic integer encoding of the intended application:
   - `SYNFUEL`: 0
   - `CHEMICAL_FEEDSTOCK`: 1
   - `CONSTRUCTION` / `BUILDING_MATERIALS`: 2
   - `FOOD_BEVERAGE`: 3
   - `GREENHOUSE`: 4
   - `OTHER`: 5

> **Privacy Guarantee**: No user IDs, passwords, company trade secrets, or PII are used or transmitted to the ML service.

---

## 3. Data Policy & Synthetic Data Tracking

1. **Real Data Priority**: When sufficient volume of settled transactions (`Order.overallStatus = 'DELIVERED'` / `Auction.status = 'SETTLED'`) accumulates, models are trained directly on real PostgreSQL records.
2. **Synthetic Data Policy**: When historical transactions are insufficient (< 50 records), the training pipeline utilizes a simulated dataset grounded in chemical engineering operating economics.
3. **Transparency Label**: All synthetic records and training runs are strictly tagged with:
   `"provenance": "SYNTHETIC TRAINING DATA — NOT REAL MARKET DATA"`. Real and synthetic records are never conflated.

---

## 4. Model Architecture & Evaluation

- **Algorithm**: `XGBRegressor` with `objective='reg:squarederror'`, `max_depth=4`, `learning_rate=0.07`, `n_estimators=160`.
- **Validation Split**: Chronological 80/20 train/validation split (preventing data leakage).
- **Holdout Metrics**:
  - **MAE**: ~₹30.39/T
  - **RMSE**: ~₹38.16/T
  - **R²**: ~0.9689
- **Confidence Metric**: Confidence is reported as `null` unless statistically justified by conformal prediction or Bayesian variance.

---

## 5. REST API Specification

### `POST /predict-price`
Input:
```json
{
  "purity": 92.0,
  "quantityTonnes": 300.0,
  "distanceKm": 85.0,
  "demandIndex": 72.0,
  "supplyIndex": 41.0,
  "auctionAveragePrice": 2650.0,
  "intendedUse": "BUILDING_MATERIALS"
}
```

Response:
```json
{
  "predictedPricePerTonne": 2718.50,
  "modelAvailable": true,
  "confidence": null,
  "mae": 30.39,
  "r2": 0.9689,
  "modelVersion": "1.0.0",
  "reason": null
}
```

### `GET /health`
Returns service health status and whether the XGBoost model is loaded into memory cache.

### `GET /model-info`
Returns model metadata, sample counts, feature list, and evaluation metrics.

---

## 6. Local Development & Retraining

### Running the Service:
```bash
cd ml-service
# Activate virtual environment
.\.venv\Scripts\activate
# Start FastAPI service
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Retraining the Model:
```bash
python training/train.py
```

### Running Tests:
```bash
pytest tests/ -v
```
