import sys
import json
import logging
from pathlib import Path
from typing import Optional, Dict, Any
import joblib

from .config import settings
from .schemas import PricePredictionRequest, PricePredictionResponse, ModelInfoResponse

# Ensure training directory is in sys.path to import feature_engineering
TRAINING_DIR = settings.BASE_DIR / "training"
if str(TRAINING_DIR) not in sys.path:
    sys.path.insert(0, str(TRAINING_DIR))

from feature_engineering import preprocess_row

logger = logging.getLogger("carbonbridge.ml.predictor")

class ModelPredictor:
    def __init__(self):
        self._model: Optional[Any] = None
        self._metadata: Optional[Dict[str, Any]] = None
        self._loaded: bool = False
        self.load_model()

    def load_model(self) -> bool:
        """Load XGBoost model and metadata into memory cache."""
        if not settings.MODEL_PATH.exists():
            logger.warning(f"Model file not found at {settings.MODEL_PATH}")
            self._model = None
            self._loaded = False
            return False

        try:
            self._model = joblib.load(settings.MODEL_PATH)
            if settings.METADATA_PATH.exists():
                with open(settings.METADATA_PATH, "r", encoding="utf-8") as f:
                    self._metadata = json.load(f)
            else:
                self._metadata = {
                    "modelName": "xgboost-co2-price",
                    "version": "1.0.0",
                    "dataSource": "Unknown",
                }
            self._loaded = True
            logger.info(f"Loaded XGBoost model from {settings.MODEL_PATH}")
            return True
        except Exception as e:
            logger.error(f"Failed to load model from {settings.MODEL_PATH}: {e}")
            self._model = None
            self._loaded = False
            return False

    @property
    def is_available(self) -> bool:
        return self._loaded and self._model is not None

    def get_model_info(self) -> ModelInfoResponse:
        """Return model metadata."""
        if not self.is_available:
            return ModelInfoResponse(
                modelName="xgboost-co2-price",
                version="none",
                dataSource="No model loaded",
            )
        
        meta = self._metadata or {}
        return ModelInfoResponse(
            modelName=meta.get("modelName", "xgboost-co2-price"),
            version=meta.get("version", "1.0.0"),
            trainedAt=meta.get("trainedAt"),
            sampleCount=meta.get("sampleCount"),
            validationSamples=meta.get("validationSamples"),
            mae=meta.get("mae"),
            rmse=meta.get("rmse"),
            r2=meta.get("r2"),
            features=meta.get("features", []),
            dataSource=meta.get("dataSource", "Unknown"),
        )

    def predict(self, req: PricePredictionRequest) -> PricePredictionResponse:
        """Perform price inference using the cached XGBoost model."""
        if not self.is_available:
            # Try reloading once in case it was just trained
            if not self.load_model():
                return PricePredictionResponse(
                    predictedPricePerTonne=None,
                    modelAvailable=False,
                    confidence=None,
                    reason="Model artifact not found or insufficient historical transaction data.",
                )

        try:
            X = preprocess_row(req.model_dump())
            raw_pred = self._model.predict(X)
            predicted_price = round(float(raw_pred[0]), 2)

            meta = self._metadata or {}
            return PricePredictionResponse(
                predictedPricePerTonne=predicted_price,
                modelAvailable=True,
                confidence=None,  # Not statistically justified to invent an arbitrary confidence score
                mae=meta.get("mae"),
                r2=meta.get("r2"),
                modelVersion=meta.get("version", "1.0.0"),
                reason=None,
            )
        except Exception as e:
            logger.error(f"Inference error: {e}")
            return PricePredictionResponse(
                predictedPricePerTonne=None,
                modelAvailable=False,
                confidence=None,
                reason=f"Prediction error: {str(e)}",
            )

predictor = ModelPredictor()
