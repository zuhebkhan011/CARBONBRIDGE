from typing import Optional
from pydantic import BaseModel, Field

class PricePredictionRequest(BaseModel):
    purity: float = Field(
        ...,
        ge=50.0,
        le=100.0,
        description="CO2 purity percentage (50% to 100%)",
        examples=[92.0]
    )
    quantityTonnes: float = Field(
        ...,
        gt=0.0,
        description="Lot quantity in metric tonnes",
        examples=[300.0]
    )
    distanceKm: float = Field(
        0.0,
        ge=0.0,
        description="Logistics distance from emitter to delivery point in km",
        examples=[85.0]
    )
    demandIndex: float = Field(
        50.0,
        ge=0.0,
        description="Active regional buyer requirement demand index",
        examples=[72.0]
    )
    supplyIndex: float = Field(
        50.0,
        ge=0.0,
        description="Active regional available supply index",
        examples=[41.0]
    )
    auctionAveragePrice: float = Field(
        2500.0,
        ge=0.0,
        description="Recent market auction clearing or average price in INR/T",
        examples=[2650.0]
    )
    intendedUse: str = Field(
        "OTHER",
        description="Intended industrial application category",
        examples=["BUILDING_MATERIALS"]
    )

class PricePredictionResponse(BaseModel):
    predictedPricePerTonne: Optional[float] = Field(
        None,
        description="Predicted CO2 price per metric tonne in INR"
    )
    modelAvailable: bool = Field(
        ...,
        description="Whether a validated ML model artifact is loaded and active"
    )
    confidence: Optional[float] = Field(
        None,
        description="Statistical confidence score if statistically justified, otherwise null"
    )
    mae: Optional[float] = Field(
        None,
        description="Validation Mean Absolute Error in INR/T"
    )
    r2: Optional[float] = Field(
        None,
        description="Validation R-squared metric"
    )
    modelVersion: Optional[str] = Field(
        None,
        description="Version string of the deployed model"
    )
    reason: Optional[str] = Field(
        None,
        description="Explanation if model is unavailable"
    )

class ModelInfoResponse(BaseModel):
    modelName: str
    version: str
    trainedAt: Optional[str] = None
    sampleCount: Optional[int] = None
    validationSamples: Optional[int] = None
    mae: Optional[float] = None
    rmse: Optional[float] = None
    r2: Optional[float] = None
    features: list[str] = []
    dataSource: str
