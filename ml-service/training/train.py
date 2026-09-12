import os
import sys
import json
import datetime
from pathlib import Path

# Ensure training directory is in Python path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import pandas as pd
import joblib
from xgboost import XGBRegressor

from feature_engineering import FEATURE_COLUMNS, preprocess_dataframe
from evaluate import evaluate_predictions, print_evaluation_report

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"
DATA_DIR = BASE_DIR / "data"

MODELS_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

MODEL_FILE = MODELS_DIR / "carbon_price_model.pkl"
METADATA_FILE = MODELS_DIR / "model_metadata.json"
SYNTHETIC_DATA_FILE = DATA_DIR / "synthetic_training_data.csv"

def generate_synthetic_market_data(n_samples: int = 800) -> pd.DataFrame:
    """
    Generate synthetic commercial CCUS transaction data for model training/benchmarking.
    Clearly marked as: SYNTHETIC TRAINING DATA — NOT REAL MARKET DATA.
    Reflects realistic industrial CCUS physics, purity premiums, volume tiers, logistics, and liquidity.
    """
    np.random.seed(42)
    start_date = datetime.datetime(2025, 1, 1)
    
    dates = [start_date + datetime.timedelta(hours=int(i * 18 + np.random.uniform(0, 6))) for i in range(n_samples)]
    purities = np.random.uniform(65.0, 99.9, n_samples)
    quantities = np.random.choice([25, 50, 100, 150, 200, 300, 500, 800], size=n_samples, p=[0.1, 0.15, 0.25, 0.15, 0.15, 0.1, 0.05, 0.05])
    distances = np.random.uniform(10.0, 350.0, n_samples)
    demand_indices = np.random.uniform(20.0, 95.0, n_samples)
    supply_indices = np.random.uniform(20.0, 95.0, n_samples)
    auction_avg_prices = np.random.uniform(2200.0, 2800.0, n_samples)
    
    applications = np.random.choice(
        ["SYNFUEL", "CHEMICAL_FEEDSTOCK", "CONSTRUCTION", "FOOD_BEVERAGE", "GREENHOUSE", "OTHER"],
        size=n_samples,
        p=[0.25, 0.20, 0.25, 0.15, 0.10, 0.05]
    )

    prices = []
    for i in range(n_samples):
        # 1. Base industrial flue gas benchmark
        p = 2350.0

        # 2. Purity premium / discount
        purity = purities[i]
        if purity > 80.0:
            p += (purity - 80.0) * 32.0
        elif purity < 70.0:
            p -= (70.0 - purity) * 22.0

        # 3. Volume scale discount
        qty = quantities[i]
        if qty >= 500:
            p *= 0.92  # 8% discount
        elif qty >= 200:
            p *= 0.96  # 4% discount

        # 4. Supply/Demand market liquidity effect
        dem = demand_indices[i]
        sup = supply_indices[i]
        ratio = dem / max(sup, 1.0)
        if ratio >= 1.25:
            p += 85.0
        elif ratio <= 0.65:
            p -= 55.0

        # 5. Application willingness to pay
        app = applications[i]
        if app in ["SYNFUEL", "FOOD_BEVERAGE"]:
            p += 40.0
        elif app == "CONSTRUCTION":
            p -= 30.0

        # 6. Logistics distance adjustment
        dist = distances[i]
        p += min(dist * 0.45, 120.0)

        # 7. Auction market pull (10% weighting towards active auction clearing prices)
        p = 0.90 * p + 0.10 * auction_avg_prices[i]

        # 8. Uncorrelated random commercial variation (gaussian noise)
        p += np.random.normal(0, 18.0)

        prices.append(round(float(p), 2))

    df = pd.DataFrame({
        "timestamp": dates,
        "purity": np.round(purities, 2),
        "quantityTonnes": quantities,
        "distanceKm": np.round(distances, 1),
        "demandIndex": np.round(demand_indices, 1),
        "supplyIndex": np.round(supply_indices, 1),
        "auctionAveragePrice": np.round(auction_avg_prices, 2),
        "intendedUse": applications,
        "pricePerTonne": prices,
        "provenance": "SYNTHETIC TRAINING DATA — NOT REAL MARKET DATA",
    })

    # Sort chronologically
    df = df.sort_values("timestamp").reset_index(drop=True)
    return df

def train_model():
    print("=" * 60)
    print("  CarbonBridge ML Price Prediction — Model Training")
    print("=" * 60)

    # 1. Dataset Acquisition
    # Check if a real historical transactions export exists
    real_data_path = DATA_DIR / "real_completed_transactions.csv"
    if real_data_path.exists():
        print(f"Loading real transaction data from: {real_data_path}")
        df = pd.read_csv(real_data_path)
        data_source = "PostgreSQL Completed Transactions (Real Market Data)"
    else:
        print("Note: Insufficient real completed transaction records in local database.")
        print("Generating synthetic CCUS commercial dataset (marked explicitly).")
        df = generate_synthetic_market_data(n_samples=850)
        df.to_csv(SYNTHETIC_DATA_FILE, index=False)
        print(f"Saved synthetic dataset to: {SYNTHETIC_DATA_FILE}")
        data_source = "SYNTHETIC TRAINING DATA — NOT REAL MARKET DATA"

    # 2. Chronological Train/Validation Split (80/20)
    split_idx = int(len(df) * 0.80)
    train_df = df.iloc[:split_idx].copy()
    val_df = df.iloc[split_idx:].copy()

    print(f"\nTotal samples     : {len(df)}")
    print(f"Training samples  : {len(train_df)}")
    print(f"Validation samples: {len(val_df)}")
    print(f"Data Source       : {data_source}")

    # 3. Feature Preprocessing
    X_train = preprocess_dataframe(train_df)
    y_train = train_df["pricePerTonne"].values

    X_val = preprocess_dataframe(val_df)
    y_val = val_df["pricePerTonne"].values

    # 4. Train XGBoost Regressor
    print("\nTraining XGBoost Regressor (objective='reg:squarederror')...")
    model = XGBRegressor(
        n_estimators=160,
        max_depth=4,
        learning_rate=0.07,
        subsample=0.85,
        colsample_bytree=0.85,
        random_state=42,
        tree_method="hist",
    )
    model.fit(X_train, y_train)

    # 5. Evaluate
    val_preds = model.predict(X_val)
    val_metrics = evaluate_predictions(y_val, val_preds)
    print_evaluation_report(val_metrics, split_name="Holdout Validation Set")

    train_preds = model.predict(X_train)
    train_metrics = evaluate_predictions(y_train, train_preds)

    # 6. Persist Model and Metadata
    joblib.dump(model, MODEL_FILE)
    print(f"Saved trained XGBoost model to: {MODEL_FILE}")

    metadata = {
        "modelName": "xgboost-co2-price",
        "version": "1.0.0",
        "trainedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sampleCount": len(train_df),
        "validationSamples": len(val_df),
        "mae": val_metrics["mae"],
        "rmse": val_metrics["rmse"],
        "r2": val_metrics["r2"],
        "trainMae": train_metrics["mae"],
        "trainR2": train_metrics["r2"],
        "features": FEATURE_COLUMNS,
        "dataSource": data_source,
    }

    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"Saved model metadata to: {METADATA_FILE}")

    print("\nTraining completed successfully!")
    return metadata

if __name__ == "__main__":
    train_model()
