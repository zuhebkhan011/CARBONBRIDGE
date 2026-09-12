import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings:
    SERVICE_NAME: str = "carbonbridge-ml-service"
    SERVICE_VERSION: str = "1.0.0"
    HOST: str = os.getenv("ML_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("ML_PORT", "8000"))
    
    BASE_DIR: Path = BASE_DIR
    MODELS_DIR: Path = BASE_DIR / "models"
    MODEL_PATH: Path = MODELS_DIR / "carbon_price_model.pkl"
    METADATA_PATH: Path = MODELS_DIR / "model_metadata.json"
    DATA_DIR: Path = BASE_DIR / "data"

settings = Settings()
