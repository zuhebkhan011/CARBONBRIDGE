from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .schemas import (
    PricePredictionRequest,
    PricePredictionResponse,
    ModelInfoResponse,
)
from .predictor import predictor

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("carbonbridge.ml.api")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.SERVICE_NAME} v{settings.SERVICE_VERSION}")
    loaded = predictor.load_model()
    if loaded:
        logger.info(f"XGBoost model loaded successfully. Ready for inference.")
    else:
        logger.warning("XGBoost model not loaded. Service will report modelAvailable=False.")
    yield
    logger.info(f"Shutting down {settings.SERVICE_NAME}")

app = FastAPI(
    title="CarbonBridge ML Price Prediction Service",
    description="Dedicated microservice predicting CO2 price per tonne using XGBoost regression.",
    version=settings.SERVICE_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
        "modelAvailable": predictor.is_available,
    }

@app.get("/model-info", response_model=ModelInfoResponse)
def get_model_info():
    return predictor.get_model_info()

@app.post("/predict-price", response_model=PricePredictionResponse)
def predict_price(request: PricePredictionRequest):
    return predictor.predict(request)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.HOST, port=settings.PORT)
