import pytest
from fastapi.testclient import TestClient

import sys
from pathlib import Path

# Add ml-service root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "modelAvailable" in data
    assert data["modelAvailable"] is True

def test_model_info_endpoint():
    response = client.get("/model-info")
    assert response.status_code == 200
    data = response.json()
    assert data["modelName"] == "xgboost-co2-price"
    assert "features" in data
    assert len(data["features"]) == 7
    assert data["mae"] is not None
    assert data["r2"] is not None

def test_valid_price_prediction():
    payload = {
        "purity": 92.0,
        "quantityTonnes": 300.0,
        "distanceKm": 85.0,
        "demandIndex": 72.0,
        "supplyIndex": 41.0,
        "auctionAveragePrice": 2650.0,
        "intendedUse": "BUILDING_MATERIALS",
    }
    response = client.post("/predict-price", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["modelAvailable"] is True
    assert data["predictedPricePerTonne"] is not None
    assert data["predictedPricePerTonne"] > 1500  # realistic industrial price range
    assert data["predictedPricePerTonne"] < 5000
    assert data["confidence"] is None  # explicitly null as per specification
    assert data["mae"] is not None
    assert data["r2"] is not None

def test_invalid_purity_too_low():
    payload = {
        "purity": 30.0,  # Below 50% minimum
        "quantityTonnes": 100.0,
        "distanceKm": 50.0,
    }
    response = client.post("/predict-price", json=payload)
    assert response.status_code == 422  # Pydantic validation error

def test_invalid_purity_too_high():
    payload = {
        "purity": 105.0,  # Above 100%
        "quantityTonnes": 100.0,
    }
    response = client.post("/predict-price", json=payload)
    assert response.status_code == 422

def test_invalid_quantity_zero():
    payload = {
        "purity": 85.0,
        "quantityTonnes": 0.0,  # Must be > 0
    }
    response = client.post("/predict-price", json=payload)
    assert response.status_code == 422

def test_unknown_intended_use_fallback():
    payload = {
        "purity": 85.0,
        "quantityTonnes": 100.0,
        "distanceKm": 50.0,
        "intendedUse": "NON_EXISTENT_APPLICATION_XYZ",
    }
    response = client.post("/predict-price", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["modelAvailable"] is True
    assert data["predictedPricePerTonne"] is not None
