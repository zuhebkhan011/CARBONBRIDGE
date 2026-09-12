from typing import Dict
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

def evaluate_predictions(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    """Calculate and return regression evaluation metrics."""
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2 = float(r2_score(y_true, y_pred))
    
    return {
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "r2": round(r2, 4),
    }

def print_evaluation_report(metrics: Dict[str, float], split_name: str = "Validation") -> None:
    """Pretty print evaluation metrics."""
    print(f"\n==========================================")
    print(f"   CarbonBridge ML Evaluation ({split_name})")
    print(f"==========================================")
    print(f"  MAE  (Mean Absolute Error): INR {metrics['mae']}/T")
    print(f"  RMSE (Root Mean Sq Error)  : INR {metrics['rmse']}/T")
    print(f"  R2   (Coefficient of Det)  : {metrics['r2']}")
    print(f"==========================================\n")

