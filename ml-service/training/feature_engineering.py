from typing import Any, Dict
import pandas as pd
import numpy as np

INTENDED_USE_MAP: Dict[str, int] = {
    "SYNFUEL": 0,
    "CHEMICAL_FEEDSTOCK": 1,
    "CONSTRUCTION": 2,
    "BUILDING_MATERIALS": 2,  # alias for construction materials
    "FOOD_BEVERAGE": 3,
    "GREENHOUSE": 4,
    "OTHER": 5,
}

FEATURE_COLUMNS = [
    "purity",
    "quantityTonnes",
    "distanceKm",
    "demandIndex",
    "supplyIndex",
    "auctionAveragePrice",
    "intendedUse_encoded",
]

def encode_intended_use(intended_use: str) -> int:
    """Safely map categorical intended use to deterministic integer encoding."""
    if not intended_use:
        return INTENDED_USE_MAP["OTHER"]
    norm = str(intended_use).strip().upper().replace(" ", "_").replace("-", "_")
    return INTENDED_USE_MAP.get(norm, INTENDED_USE_MAP["OTHER"])

def preprocess_row(data: Dict[str, Any]) -> pd.DataFrame:
    """Preprocess a single input dictionary into a 1-row DataFrame with ordered feature columns."""
    row = {
        "purity": float(data.get("purity", 75.0)),
        "quantityTonnes": float(data.get("quantityTonnes", 100.0)),
        "distanceKm": float(data.get("distanceKm", 0.0)),
        "demandIndex": float(data.get("demandIndex", 50.0)),
        "supplyIndex": float(data.get("supplyIndex", 50.0)),
        "auctionAveragePrice": float(data.get("auctionAveragePrice", 2500.0)),
        "intendedUse_encoded": encode_intended_use(data.get("intendedUse", "OTHER")),
    }
    return pd.DataFrame([row], columns=FEATURE_COLUMNS)

def preprocess_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Preprocess an entire DataFrame, handling missing values and categorical encoding."""
    clean_df = df.copy()

    # Fill defaults for numeric features
    clean_df["purity"] = clean_df["purity"].fillna(75.0).astype(float)
    clean_df["quantityTonnes"] = clean_df["quantityTonnes"].fillna(100.0).astype(float)
    clean_df["distanceKm"] = clean_df["distanceKm"].fillna(0.0).astype(float)
    clean_df["demandIndex"] = clean_df["demandIndex"].fillna(50.0).astype(float)
    clean_df["supplyIndex"] = clean_df["supplyIndex"].fillna(50.0).astype(float)
    clean_df["auctionAveragePrice"] = clean_df["auctionAveragePrice"].fillna(2500.0).astype(float)

    # Encode categorical intendedUse
    if "intendedUse_encoded" not in clean_df.columns:
        if "intendedUse" in clean_df.columns:
            clean_df["intendedUse_encoded"] = clean_df["intendedUse"].apply(encode_intended_use)
        else:
            clean_df["intendedUse_encoded"] = INTENDED_USE_MAP["OTHER"]

    return clean_df[FEATURE_COLUMNS]
