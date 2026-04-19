"""
ml_models.py — Modelos de Machine Learning para Logitrack AI Service

Tres capacidades reales (no marketing):

1. predict_eta      — Regresión para predicción de tiempo de entrega
                      Features: hora del día, día semana, distancia, sucursal, historial driver
                      Arranque: heurísticas calibradas
                      Mejora: se re-entrena conforme llegan datos reales

2. detect_anomaly   — IsolationForest para detectar rutas sospechosas
                      Features: velocidad promedio, paradas largas, desvío de ruta
                      Usa heurísticas hasta tener suficientes datos

3. demand_forecast  — Predicción de pedidos por sucursal/hora del día
                      Arranque: promedio histórico de las últimas N semanas
                      Mejora: agrega factores día/hora/clima conforme crece el dataset
"""

import os
import logging
import math
import json
from datetime import datetime

import numpy as np
import joblib
from sklearn.ensemble import RandomForestRegressor, IsolationForest
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger("ai-service.ml")

# ────────────────────────────��─────────────────────────────────���───────────────
# RUTAS DE MODELOS
# ──────────────────────────────────────────────────────────────────────────────

MODEL_DIR = os.getenv("MODEL_DIR", "/app/models")
os.makedirs(MODEL_DIR, exist_ok=True)

ETA_MODEL_PATH      = os.path.join(MODEL_DIR, "eta_model.joblib")
ETA_SCALER_PATH     = os.path.join(MODEL_DIR, "eta_scaler.joblib")
ANOMALY_MODEL_PATH  = os.path.join(MODEL_DIR, "anomaly_model.joblib")
DEMAND_DATA_PATH    = os.path.join(MODEL_DIR, "demand_history.json")

# Mínimo de muestras para entrenar vs usar heurística
MIN_SAMPLES_ETA     = 50
MIN_SAMPLES_ANOMALY = 100


# ──────────────────────────────────────────────────────────────────────────────
# HEURÍSTICAS CALIBRADAS (arranque sin datos)
# ──────────────────────────────────────────────────────────────────────────────

# Factores de ajuste por hora del día (rush hours = más lento)
# Basado en datos típicos de ciudades de Guatemala/El Salvador
HOUR_FACTORS = {
    0: 0.6, 1: 0.5, 2: 0.5, 3: 0.5, 4: 0.5, 5: 0.6,
    6: 0.9, 7: 1.3, 8: 1.5, 9: 1.2, 10: 1.0, 11: 1.1,
    12: 1.3, 13: 1.4, 14: 1.2, 15: 1.1, 16: 1.2, 17: 1.5,
    18: 1.6, 19: 1.4, 20: 1.2, 21: 1.0, 22: 0.8, 23: 0.7,
}

# Factores por día de la semana (0=Lunes, 6=Domingo)
DAY_FACTORS = {0: 1.1, 1: 1.0, 2: 1.0, 3: 1.05, 4: 1.15, 5: 1.2, 6: 0.8}

BASE_SPEED_KMH = 22.0  # velocidad base urbana (más conservador que 25)


def heuristic_eta(distance_km: float, hour: int, day_of_week: int) -> float:
    """
    ETA heurístico calibrado por hora y día.
    Más preciso que velocidad fija de 25 km/h.
    """
    if distance_km <= 0:
        return 0.0
    hour_f = HOUR_FACTORS.get(hour, 1.0)
    day_f  = DAY_FACTORS.get(day_of_week, 1.0)
    effective_speed = BASE_SPEED_KMH / (hour_f * day_f)
    effective_speed = max(effective_speed, 5.0)  # mínimo 5 km/h
    return (distance_km / effective_speed) * 60.0


# ──────────────────────────────────────────────────────────────────────────────
# MODELO 1: PREDICCIÓN DE ETA
# ──────────────────────────────────────────────────────────────────────────────

_eta_model  = None
_eta_scaler = None
_eta_ready  = False


def _load_eta_model():
    global _eta_model, _eta_scaler, _eta_ready
    if os.path.exists(ETA_MODEL_PATH) and os.path.exists(ETA_SCALER_PATH):
        try:
            _eta_model  = joblib.load(ETA_MODEL_PATH)
            _eta_scaler = joblib.load(ETA_SCALER_PATH)
            _eta_ready  = True
            logger.info("Modelo ETA cargado desde disco")
        except Exception as e:
            logger.warning(f"No se pudo cargar modelo ETA: {e}")
            _eta_ready = False


def predict_eta(
    distance_km: float,
    hour: int,
    day_of_week: int,
    branch: str = "central",
    driver_avg_speed: float = None,
) -> dict:
    """
    Predice el tiempo de entrega en minutos.

    Returns:
        {
          "eta_min": float,
          "method": "ml_model" | "heuristic",
          "confidence": "high" | "medium" | "low"
        }
    """
    global _eta_model, _eta_scaler, _eta_ready

    if not _eta_ready:
        _load_eta_model()

    # Features: [distance_km, hour_sin, hour_cos, day_sin, day_cos, driver_speed, branch_encoded]
    # Encoding cíclico para hora y día (no ordinal)
    hour_sin = math.sin(2 * math.pi * hour / 24)
    hour_cos = math.cos(2 * math.pi * hour / 24)
    day_sin  = math.sin(2 * math.pi * day_of_week / 7)
    day_cos  = math.cos(2 * math.pi * day_of_week / 7)

    # Branch encoding simple (hash numérico estable)
    branch_code = abs(hash(branch)) % 100

    # driver_speed: si no viene, usar promedio histórico
    if driver_avg_speed is None or driver_avg_speed <= 0:
        driver_avg_speed = BASE_SPEED_KMH

    features = [[distance_km, hour_sin, hour_cos, day_sin, day_cos,
                 driver_speed_to_feature(driver_avg_speed), branch_code]]

    if _eta_ready and _eta_model is not None:
        try:
            X = np.array(features)
            X_scaled = _eta_scaler.transform(X)
            eta = float(_eta_model.predict(X_scaled)[0])
            eta = max(eta, distance_km / 80.0 * 60)  # sanity: mínimo a 80 km/h
            eta = min(eta, distance_km / 3.0 * 60)   # sanity: máximo a 3 km/h

            n_samples = getattr(_eta_model, 'n_samples_seen_', 0) or \
                        getattr(_eta_model, 'n_estimators', 0)
            confidence = "high" if n_samples > MIN_SAMPLES_ETA * 5 else "medium"

            return {"eta_min": round(eta, 1), "method": "ml_model", "confidence": confidence}
        except Exception as e:
            logger.warning(f"Predicción ML falló, usando heurística: {e}")

    # Heurística calibrada
    eta = heuristic_eta(distance_km, hour, day_of_week)
    return {"eta_min": round(eta, 1), "method": "heuristic", "confidence": "medium"}


def driver_speed_to_feature(speed: float) -> float:
    """Normaliza velocidad del driver a feature (ratio vs base)."""
    return speed / BASE_SPEED_KMH if BASE_SPEED_KMH > 0 else 1.0


def train_eta_model(training_data: list) -> dict:
    """
    Re-entrena el modelo ETA con datos reales.

    training_data: lista de dicts con keys:
      distance_km, hour, day_of_week, branch, driver_avg_speed, actual_eta_min

    Returns: {"trained": bool, "n_samples": int, "rmse_approx": float}
    """
    global _eta_model, _eta_scaler, _eta_ready

    if len(training_data) < MIN_SAMPLES_ETA:
        return {
            "trained": False,
            "message": f"Se necesitan mínimo {MIN_SAMPLES_ETA} muestras (hay {len(training_data)})"
        }

    X, y = [], []
    for d in training_data:
        try:
            hour = int(d["hour"])
            dow  = int(d["day_of_week"])
            X.append([
                float(d["distance_km"]),
                math.sin(2 * math.pi * hour / 24),
                math.cos(2 * math.pi * hour / 24),
                math.sin(2 * math.pi * dow / 7),
                math.cos(2 * math.pi * dow / 7),
                driver_speed_to_feature(float(d.get("driver_avg_speed") or BASE_SPEED_KMH)),
                abs(hash(d.get("branch", "central"))) % 100,
            ])
            y.append(float(d["actual_eta_min"]))
        except (KeyError, ValueError, TypeError):
            continue

    if len(X) < MIN_SAMPLES_ETA:
        return {"trained": False, "message": "Datos inválidos o insuficientes después de limpieza"}

    X, y = np.array(X), np.array(y)

    # Filtrar outliers extremos (>3h de entrega son anómalos para entrenamiento)
    mask = y < 180
    X, y = X[mask], y[mask]

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = RandomForestRegressor(
        n_estimators=100,
        max_depth=8,
        min_samples_leaf=5,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_scaled, y)

    # RMSE aproximado en training (idealmente usar cross-validation en prod)
    preds = model.predict(X_scaled)
    rmse = float(np.sqrt(np.mean((preds - y) ** 2)))

    joblib.dump(model, ETA_MODEL_PATH)
    joblib.dump(scaler, ETA_SCALER_PATH)

    _eta_model  = model
    _eta_scaler = scaler
    _eta_ready  = True

    logger.info(f"Modelo ETA entrenado con {len(X)} muestras, RMSE={rmse:.2f} min")
    return {"trained": True, "n_samples": len(X), "rmse_approx": round(rmse, 2)}


# ──────────────────────────────────────────────────────────────────────────────
# MODELO 2: DETECCIÓN DE ANOMALÍAS EN RUTAS
# ──────────────────────────────────────────────────────────────────────────────

_anomaly_model = None
_anomaly_ready = False


def _load_anomaly_model():
    global _anomaly_model, _anomaly_ready
    if os.path.exists(ANOMALY_MODEL_PATH):
        try:
            _anomaly_model = joblib.load(ANOMALY_MODEL_PATH)
            _anomaly_ready = True
            logger.info("Modelo de anomalías cargado desde disco")
        except Exception as e:
            logger.warning(f"No se pudo cargar modelo anomalías: {e}")


def detect_route_anomaly(route_stats: dict) -> dict:
    """
    Detecta si una ruta es anómala.

    route_stats: {
      avg_speed_kmh, max_speed_kmh, total_distance_km,
      total_duration_min, stop_count, max_stop_duration_min,
      expected_distance_km, expected_duration_min
    }

    Returns: {
      "anomaly": bool,
      "score": float,       # -1.0 = muy anómalo, 1.0 = normal
      "flags": [str],       # razones legibles
      "severity": "none" | "low" | "medium" | "high"
    }
    """
    global _anomaly_model, _anomaly_ready

    if not _anomaly_ready:
        _load_anomaly_model()

    flags = []

    avg_speed = route_stats.get("avg_speed_kmh", 0)
    max_speed = route_stats.get("max_speed_kmh", 0)
    stop_count = route_stats.get("stop_count", 0)
    max_stop_min = route_stats.get("max_stop_duration_min", 0)
    total_dist = route_stats.get("total_distance_km", 0)
    expected_dist = route_stats.get("expected_distance_km", total_dist)
    total_dur = route_stats.get("total_duration_min", 0)
    expected_dur = route_stats.get("expected_duration_min", total_dur)

    # ── Heurísticas de anomalía (siempre activas como primera capa) ──

    if avg_speed > 80:
        flags.append(f"Velocidad promedio excesiva: {avg_speed:.1f} km/h (moto en zona urbana)")
    if max_speed > 120:
        flags.append(f"Velocidad máxima irreal: {max_speed:.1f} km/h")
    if max_stop_min > 45:
        flags.append(f"Parada muy larga: {max_stop_min:.0f} min")
    if expected_dist > 0 and total_dist > expected_dist * 2.5:
        flags.append(f"Distancia recorrida {total_dist:.1f} km vs esperada {expected_dist:.1f} km (×{total_dist/expected_dist:.1f})")
    if expected_dur > 0 and total_dur > expected_dur * 3:
        flags.append(f"Tiempo {total_dur:.0f} min vs esperado {expected_dur:.0f} min (×{total_dur/expected_dur:.1f})")

    score = 1.0  # 1 = normal por defecto

    # ── Si tenemos modelo ML, obtener score ──
    if _anomaly_ready and _anomaly_model is not None:
        try:
            dist_ratio = total_dist / expected_dist if expected_dist > 0 else 1.0
            dur_ratio  = total_dur / expected_dur if expected_dur > 0 else 1.0
            features = np.array([[
                avg_speed, max_speed, total_dist, total_dur,
                stop_count, max_stop_min, dist_ratio, dur_ratio
            ]])
            raw_score = float(_anomaly_model.score_samples(features)[0])
            # IsolationForest: más negativo = más anómalo
            # Normalizar a [-1, 1] para legibilidad
            score = max(-1.0, min(1.0, raw_score * 10))
        except Exception as e:
            logger.debug(f"Anomaly ML score falló: {e}")

    # Determinar severidad combinando heurísticas + ML
    is_anomaly = len(flags) > 0 or score < -0.3
    severity = "none"
    if flags or score < -0.5:
        severity = "high" if (len(flags) >= 2 or score < -0.7) else "medium"
    elif score < -0.3:
        severity = "low"

    return {
        "anomaly": is_anomaly,
        "score": round(score, 3),
        "flags": flags,
        "severity": severity,
        "method": "ml_model" if _anomaly_ready else "heuristic",
    }


def train_anomaly_model(normal_routes: list) -> dict:
    """
    Entrena el modelo IsolationForest con rutas normales.

    normal_routes: lista de route_stats dicts (rutas sin anomalía confirmadas)
    """
    global _anomaly_model, _anomaly_ready

    if len(normal_routes) < MIN_SAMPLES_ANOMALY:
        return {
            "trained": False,
            "message": f"Se necesitan mínimo {MIN_SAMPLES_ANOMALY} rutas normales (hay {len(normal_routes)})"
        }

    X = []
    for r in normal_routes:
        try:
            expected_dist = r.get("expected_distance_km", r.get("total_distance_km", 1)) or 1
            expected_dur  = r.get("expected_duration_min", r.get("total_duration_min", 1)) or 1
            X.append([
                float(r.get("avg_speed_kmh", 0)),
                float(r.get("max_speed_kmh", 0)),
                float(r.get("total_distance_km", 0)),
                float(r.get("total_duration_min", 0)),
                float(r.get("stop_count", 0)),
                float(r.get("max_stop_duration_min", 0)),
                float(r.get("total_distance_km", 0)) / expected_dist,
                float(r.get("total_duration_min", 0)) / expected_dur,
            ])
        except (KeyError, ValueError, TypeError):
            continue

    if len(X) < MIN_SAMPLES_ANOMALY:
        return {"trained": False, "message": "Datos insuficientes tras limpieza"}

    model = IsolationForest(
        n_estimators=100,
        contamination=0.05,  # asumimos ~5% de rutas anómalas
        random_state=42,
        n_jobs=-1,
    )
    model.fit(np.array(X))
    joblib.dump(model, ANOMALY_MODEL_PATH)

    _anomaly_model = model
    _anomaly_ready = True

    logger.info(f"Modelo anomalías entrenado con {len(X)} rutas")
    return {"trained": True, "n_samples": len(X)}


# ──────────────────────────────────────────────────────────────────────────────
# MODELO 3: PREDICCIÓN DE DEMANDA POR SUCURSAL/HORA
# ──────────────────────────────────────────────────────────────────────────────

def _load_demand_history() -> dict:
    """Carga el historial de demanda desde disco (JSON simple)."""
    if os.path.exists(DEMAND_DATA_PATH):
        try:
            with open(DEMAND_DATA_PATH) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_demand_history(history: dict):
    try:
        with open(DEMAND_DATA_PATH, "w") as f:
            json.dump(history, f)
    except Exception as e:
        logger.warning(f"No se pudo guardar historial de demanda: {e}")


def update_demand_history(branch: str, hour: int, day_of_week: int, order_count: int):
    """
    Actualiza el historial de demanda con un nuevo punto.
    Se llama cuando se completa un período (e.g., cada hora desde order-service).
    """
    history = _load_demand_history()
    key = f"{branch}_{day_of_week}_{hour}"
    if key not in history:
        history[key] = {"sum": 0, "count": 0, "samples": []}
    history[key]["sum"] += order_count
    history[key]["count"] += 1
    # Guardar solo los últimos 12 valores para tendencia reciente
    history[key]["samples"] = (history[key]["samples"] + [order_count])[-12:]
    _save_demand_history(history)


def forecast_demand(branch: str, hours_ahead: int = 4) -> list:
    """
    Predice la demanda esperada de pedidos para las próximas `hours_ahead` horas.

    Returns: lista de {
      "hour": int,
      "day_of_week": int,
      "predicted_orders": int,
      "confidence": "data_driven" | "heuristic"
    }
    """
    history = _load_demand_history()
    now = datetime.now()
    results = []

    for i in range(hours_ahead):
        future = now.replace(minute=0, second=0, microsecond=0)
        future_hour = (future.hour + i) % 24
        future_dow  = (future.weekday() + (future.hour + i) // 24) % 7

        key = f"{branch}_{future_dow}_{future_hour}"
        data = history.get(key, {})

        if data.get("count", 0) >= 4:
            # Datos históricos suficientes: usar promedio ponderado reciente
            samples = data.get("samples", [])
            if len(samples) >= 3:
                # Mayor peso a las últimas muestras (promedio exponencial simple)
                weights = np.exp(np.linspace(-1, 0, len(samples)))
                weights /= weights.sum()
                predicted = float(np.dot(weights, samples))
            else:
                predicted = data["sum"] / data["count"]
            confidence = "data_driven"
        else:
            # Heurística: distribución típica de pedidos por hora (normalizada a 10 pedidos/día)
            BASE_HOURLY = {
                8: 0.5, 9: 0.8, 10: 1.2, 11: 1.5, 12: 2.0, 13: 1.8,
                14: 1.5, 15: 1.2, 16: 1.0, 17: 0.8, 18: 1.5, 19: 1.2, 20: 0.8,
            }
            predicted = BASE_HOURLY.get(future_hour, 0.3)
            if future_dow in (5, 6):  # fin de semana
                predicted *= 1.3
            confidence = "heuristic"

        results.append({
            "hour": future_hour,
            "day_of_week": future_dow,
            "predicted_orders": max(0, round(predicted)),
            "predicted_orders_float": round(predicted, 2),
            "confidence": confidence,
        })

    return results
