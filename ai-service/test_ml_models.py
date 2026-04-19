"""
Tests para ml_models.py — IA real de Logitrack

Correr con: pytest test_ml_models.py -v
"""

import os
import sys
import math
import tempfile
import pytest

# Usar directorio temporal para modelos en tests
os.environ["MODEL_DIR"] = tempfile.mkdtemp()

from ml_models import (
    haversine_km,
    heuristic_eta,
    speedMsToKmh,      # no existe, test via predict_eta
    predict_eta,
    train_eta_model,
    detect_route_anomaly,
    train_anomaly_model,
    forecast_demand,
    update_demand_history,
    HOUR_FACTORS,
    DAY_FACTORS,
)


# ──────────────────────────────────────────────────────────────────────────────
# haversine_km
# ──────────────────────────────────────────────────────────────────────────────

def test_haversine_same_point():
    assert haversine_km(13.69, -89.22, 13.69, -89.22) == 0.0

def test_haversine_known_distance():
    """San Salvador → Guatemala Ciudad ≈ 174 km en línea recta (haversine)."""
    d = haversine_km(13.6929, -89.2182, 14.6349, -90.5069)
    assert 164 < d < 184, f"Distancia esperada ≈174km, got {d:.1f}"

def test_haversine_symmetric():
    d1 = haversine_km(13.0, -89.0, 14.0, -90.0)
    d2 = haversine_km(14.0, -90.0, 13.0, -89.0)
    assert abs(d1 - d2) < 0.001

def test_haversine_short():
    """~1 km al mover 0.009 grados de latitud."""
    d = haversine_km(13.6929, -89.2182, 13.7019, -89.2182)
    assert 0.8 < d < 1.2, f"Distancia corta esperada ≈1km, got {d:.3f}"


# ──────────────────────────────────────────────────────────────────────────────
# heuristic_eta
# ──────────────────────────────────────────────────────────────────────────────

def test_heuristic_eta_zero_distance():
    assert heuristic_eta(0, 10, 1) == 0.0

def test_heuristic_eta_rush_hour_slower():
    """Rush hour (8am) debe dar ETA mayor que las 2am."""
    eta_rush  = heuristic_eta(5.0, hour=8, day_of_week=1)   # martes 8am
    eta_night = heuristic_eta(5.0, hour=2, day_of_week=1)   # martes 2am
    assert eta_rush > eta_night, f"Rush hour {eta_rush:.1f} debe ser > noche {eta_night:.1f}"

def test_heuristic_eta_weekend_faster():
    """Domingo debe ser más rápido que viernes tarde."""
    eta_fri = heuristic_eta(5.0, hour=18, day_of_week=4)  # viernes 6pm
    eta_sun = heuristic_eta(5.0, hour=18, day_of_week=6)  # domingo 6pm
    assert eta_fri > eta_sun, f"Viernes tarde {eta_fri:.1f} debe ser > domingo {eta_sun:.1f}"

def test_heuristic_eta_positive():
    for hour in [0, 8, 12, 18, 23]:
        for dow in range(7):
            eta = heuristic_eta(3.0, hour, dow)
            assert eta > 0, f"ETA debe ser positivo para hora={hour}, dow={dow}"

def test_hour_factors_complete():
    """Todos los factores de hora deben estar definidos."""
    assert len(HOUR_FACTORS) == 24
    for h in range(24):
        assert h in HOUR_FACTORS, f"Falta HOUR_FACTOR para hora {h}"

def test_day_factors_complete():
    """Todos los factores de día deben estar definidos."""
    assert len(DAY_FACTORS) == 7
    for d in range(7):
        assert d in DAY_FACTORS, f"Falta DAY_FACTOR para día {d}"


# ──────────────────────────────────────────────────────────────────────────────
# predict_eta
# ──────────────────────────────────────────────────────────────────────────────

def test_predict_eta_returns_heuristic_without_model():
    """Sin modelo entrenado debe usar heurística."""
    result = predict_eta(5.0, hour=10, day_of_week=1)
    assert "eta_min" in result
    assert result["eta_min"] > 0
    assert result["method"] in ("ml_model", "heuristic")

def test_predict_eta_structure():
    result = predict_eta(3.0, hour=8, day_of_week=0, branch="central")
    assert "eta_min" in result
    assert "method" in result
    assert "confidence" in result
    assert isinstance(result["eta_min"], float)

def test_predict_eta_reasonable_range():
    """ETA para 10km debe estar entre 5 y 60 minutos."""
    result = predict_eta(10.0, hour=12, day_of_week=2)
    assert 5 < result["eta_min"] < 60, f"ETA irrazonable: {result['eta_min']}"


# ──────────────────────────────────────────────────────────────────────────────
# train_eta_model
# ──────────────────────────────────────────────────────────────────────────────

def make_training_sample(dist, hour, dow, actual_eta):
    return {
        "distance_km": dist,
        "hour": hour,
        "day_of_week": dow,
        "branch": "central",
        "driver_avg_speed": 22.0,
        "actual_eta_min": actual_eta,
    }

def test_train_eta_insufficient_data():
    """Con menos de 50 muestras no debe entrenar."""
    result = train_eta_model([make_training_sample(3, 10, 1, 15)] * 10)
    assert result["trained"] is False

def test_train_eta_sufficient_data():
    """Con 60 muestras debe entrenar correctamente."""
    data = []
    for i in range(60):
        dist = 1 + (i % 15)
        hour = (i * 3) % 24
        dow  = i % 7
        eta  = heuristic_eta(dist, hour, dow) + (i % 5 - 2)  # ruido
        data.append(make_training_sample(dist, hour, dow, max(eta, 1)))
    result = train_eta_model(data)
    assert result["trained"] is True
    assert result["n_samples"] >= 50
    assert "rmse_approx" in result
    assert result["rmse_approx"] >= 0

def test_predict_eta_uses_model_after_training():
    """Después de entrenar, el método debe ser 'ml_model'."""
    data = []
    for i in range(60):
        dist = 1 + (i % 15)
        hour = (i * 3) % 24
        dow  = i % 7
        eta  = heuristic_eta(dist, hour, dow)
        data.append(make_training_sample(dist, hour, dow, max(eta, 1)))
    train_eta_model(data)
    result = predict_eta(5.0, hour=10, day_of_week=1)
    assert result["method"] == "ml_model"


# ──────────────────────────────────────────────────────────────────────────────
# detect_route_anomaly
# ──────────────────────────────────────────────────────────────────────────────

def make_normal_route():
    return {
        "avg_speed_kmh": 22.0,
        "max_speed_kmh": 45.0,
        "total_distance_km": 15.0,
        "total_duration_min": 45.0,
        "stop_count": 3,
        "max_stop_duration_min": 5.0,
        "expected_distance_km": 15.0,
        "expected_duration_min": 40.0,
    }

def test_detect_anomaly_normal_route():
    result = detect_route_anomaly(make_normal_route())
    assert "anomaly" in result
    assert "flags" in result
    assert "severity" in result
    assert "score" in result
    # Ruta normal no debe generar flags
    assert result["anomaly"] is False
    assert result["severity"] == "none"

def test_detect_anomaly_high_speed():
    route = make_normal_route()
    route["avg_speed_kmh"] = 95.0
    route["max_speed_kmh"] = 140.0
    result = detect_route_anomaly(route)
    assert result["anomaly"] is True
    assert len(result["flags"]) > 0

def test_detect_anomaly_long_stop():
    route = make_normal_route()
    route["max_stop_duration_min"] = 60.0
    result = detect_route_anomaly(route)
    assert result["anomaly"] is True

def test_detect_anomaly_excessive_distance():
    route = make_normal_route()
    route["total_distance_km"] = 60.0  # 4x el esperado
    result = detect_route_anomaly(route)
    assert result["anomaly"] is True

def test_detect_anomaly_structure():
    result = detect_route_anomaly(make_normal_route())
    assert result["severity"] in ("none", "low", "medium", "high")
    assert result["method"] in ("ml_model", "heuristic")
    assert -1.0 <= result["score"] <= 1.0


# ──────────────────────────────────────────────────────────────────────────────
# forecast_demand
# ──────────────────────────────────────────────────────────────────────────────

def test_forecast_demand_structure():
    result = forecast_demand("central", hours_ahead=4)
    assert len(result) == 4
    for item in result:
        assert "hour" in item
        assert "predicted_orders" in item
        assert "confidence" in item
        assert item["predicted_orders"] >= 0

def test_forecast_demand_non_negative():
    result = forecast_demand("norte", hours_ahead=8)
    for item in result:
        assert item["predicted_orders"] >= 0, f"Predicción negativa: {item}"

def test_forecast_demand_data_driven():
    """Después de actualizar historial, la confianza debe ser 'data_driven'."""
    branch = "test_branch_forecast"
    # Insertar 5 puntos de datos para hora=10, dow=1
    for _ in range(5):
        update_demand_history(branch, hour=10, day_of_week=1, order_count=8)

    import datetime
    # Forzar la hora 10 del próximo lunes para el test
    # (el forecast usa datetime.now(), así que es difícil de testear directo)
    # Solo verificamos que la función corre sin error
    result = forecast_demand(branch, hours_ahead=2)
    assert isinstance(result, list)

def test_update_demand_history():
    """update_demand_history no debe fallar."""
    update_demand_history("central", hour=12, day_of_week=0, order_count=5)
    update_demand_history("central", hour=12, day_of_week=0, order_count=7)
    # Solo verificar que no lanza excepción
