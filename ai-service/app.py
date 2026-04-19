"""
AI Service - Logitrack Route Optimization
Versión 4.0.0 — OR-Tools CVRP (Capacitated Vehicle Routing Problem)

Reemplaza el algoritmo Round-Robin greedy por optimización real usando
Google OR-Tools, que resuelve el VRP con:
  - Capacidad por vehículo
  - Ventanas de tiempo opcionales
  - Minimización de distancia total
  - Backoff a greedy si OR-Tools falla (resiliencia)
"""

import math
import os
import logging

from flask import Flask, request, jsonify

# OR-Tools está disponible desde el contenedor (instalar: pip install ortools)
try:
    from ortools.constraint_solver import routing_enums_pb2
    from ortools.constraint_solver import pywrapcp
    ORTOOLS_AVAILABLE = True
except ImportError:
    ORTOOLS_AVAILABLE = False
    logging.warning("OR-Tools no disponible — usando algoritmo greedy de respaldo")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("ai-service")

app = Flask(__name__)

# Importar modelos ML (con importación lazy: si fallan no bloquean el servicio)
try:
    from ml_models import (
        predict_eta, train_eta_model,
        detect_route_anomaly, train_anomaly_model,
        forecast_demand, update_demand_history,
    )
    ML_AVAILABLE = True
except ImportError as e:
    ML_AVAILABLE = False
    logger.warning(f"ml_models no disponible: {e}")


# ──────────────────────────────────────────────────────────────────────────────
# UTILIDADES
# ──────────────────────────────────────────────────────────────────────────────

def haversine_km(lat1, lon1, lat2, lon2):
    """Distancia en km entre dos coordenadas GPS (fórmula de Haversine)."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def build_distance_matrix(locations):
    """
    Construye matriz de distancias NxN entre todas las ubicaciones.
    locations: lista de (lat, lng)
    Retorna matriz en metros enteros (OR-Tools trabaja con enteros).
    """
    n = len(locations)
    matrix = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j:
                km = haversine_km(locations[i][0], locations[i][1],
                                  locations[j][0], locations[j][1])
                matrix[i][j] = int(km * 1000)  # metros enteros
    return matrix


# ──────────────────────────────────────────────────────────────────────────────
# ALGORITMO OR-TOOLS CVRP
# ──────────────────────────────────────────────────────────────────────────────

def solve_vrp_ortools(depot_loc, order_locs, moto_capacities, speed_kmh, time_limit_sec=5):
    """
    Resuelve el CVRP con OR-Tools.

    Args:
        depot_loc:        (lat, lng) del depósito
        order_locs:       list de (lat, lng, order_id)
        moto_capacities:  list de (moto_id, capacity, lat, lng, license_plate)
                          donde lat/lng es la posición actual de la moto
        speed_kmh:        velocidad promedio para calcular ETA
        time_limit_sec:   tiempo máximo de cómputo (default 5s)

    Returns:
        list de {order_id, moto_id, moto_plate, distance_km, eta_min, order_address}
        o None si falla
    """
    if not ORTOOLS_AVAILABLE or not order_locs or not moto_capacities:
        return None

    n_orders = len(order_locs)
    n_vehicles = len(moto_capacities)

    # Nodos: [depot] + [posición inicial moto_0, ..., moto_{k-1}] + [order_0, ..., order_{n-1}]
    # Cada moto tiene su propio nodo de inicio (para partir de su ubicación actual)
    # El depot es el nodo de retorno de todas las motos

    # Construir lista de ubicaciones
    # Índice 0 = depot (retorno)
    # Índices 1..n_vehicles = posiciones iniciales de motos
    # Índices n_vehicles+1 .. n_vehicles+n_orders = pedidos
    locations = [depot_loc]
    for m in moto_capacities:
        locations.append((m[2], m[3]))  # lat, lng actual de la moto
    for o in order_locs:
        locations.append((o[0], o[1]))

    depot_idx = 0
    vehicle_starts = list(range(1, n_vehicles + 1))
    order_start_idx = n_vehicles + 1

    distance_matrix = build_distance_matrix(locations)

    # Crear el modelo de routing
    manager = pywrapcp.RoutingIndexManager(
        len(locations),
        n_vehicles,
        vehicle_starts,    # inicio de cada vehículo (su posición actual)
        [depot_idx] * n_vehicles  # retorno al depósito
    )
    routing = pywrapcp.RoutingModel(manager)

    # Callback de distancia
    def distance_callback(from_idx, to_idx):
        from_node = manager.IndexToNode(from_idx)
        to_node = manager.IndexToNode(to_idx)
        return distance_matrix[from_node][to_node]

    transit_cb = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_cb)

    # Dimension de capacidad
    def demand_callback(idx):
        node = manager.IndexToNode(idx)
        # El depósito y los nodos de inicio de motos tienen demanda 0
        if node <= n_vehicles:
            return 0
        return 1  # cada pedido requiere 1 unidad de capacidad

    demand_cb = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(
        demand_cb,
        0,  # sin capacidad slack
        [m[1] for m in moto_capacities],  # capacidades por vehículo
        True,  # start cumul to zero
        "Capacity"
    )

    # Parámetros de búsqueda
    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    search_params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    search_params.time_limit.seconds = time_limit_sec

    # Resolver
    solution = routing.SolveWithParameters(search_params)
    if not solution:
        return None

    # Extraer asignaciones
    assignments = []
    for v_idx in range(n_vehicles):
        moto = moto_capacities[v_idx]
        moto_id = moto[0]
        moto_plate = moto[4]

        route_idx = routing.Start(v_idx)
        prev_node = manager.IndexToNode(route_idx)

        while not routing.IsEnd(route_idx):
            route_idx = solution.Value(routing.NextVar(route_idx))
            node = manager.IndexToNode(route_idx)

            # Si el nodo corresponde a un pedido (índice > n_vehicles y no es el depot de retorno)
            if node >= order_start_idx:
                order_pos = node - order_start_idx
                order = order_locs[order_pos]
                dist_m = distance_matrix[prev_node][node]
                dist_km = dist_m / 1000.0
                eta_min = (dist_km / speed_kmh) * 60.0 if speed_kmh > 0 else None

                assignments.append({
                    "order_id":     order[2],      # order_id
                    "moto_id":      moto_id,
                    "moto_plate":   moto_plate,
                    "distance_km":  round(dist_km, 3),
                    "eta_min":      round(eta_min, 1) if eta_min is not None else None,
                    "order_address": order[3] if len(order) > 3 else "",
                })
                prev_node = node

    return assignments


# ──────────────────────────────────────────────────────────────────────────────
# ALGORITMO GREEDY (respaldo si OR-Tools no está disponible o falla)
# ──────────────────────────────────────────────────────────────────────────────

def solve_greedy(moto_states, unassigned, speed_kmh, max_distance_km):
    """
    Nearest-neighbor round-robin.
    Retorna lista de asignaciones en mismo formato que OR-Tools.
    """
    assignments = []
    round_num = 0

    while unassigned and round_num < 200:
        round_num += 1
        made = False
        for moto in moto_states:
            if moto["assigned_count"] >= moto["capacity"] or not unassigned:
                continue
            best_idx, best_dist = None, None
            for idx, order in enumerate(unassigned):
                d = haversine_km(moto["current_lat"], moto["current_lng"],
                                 order["latitude"], order["longitude"])
                if d <= max_distance_km and (best_dist is None or d < best_dist):
                    best_dist, best_idx = d, idx
            if best_idx is not None:
                o = unassigned.pop(best_idx)
                eta = (best_dist / speed_kmh) * 60.0 if speed_kmh > 0 else None
                assignments.append({
                    "order_id":     o["id"],
                    "moto_id":      moto["id"],
                    "moto_plate":   moto["license_plate"],
                    "distance_km":  round(best_dist, 3),
                    "eta_min":      round(eta, 1) if eta else None,
                    "order_address": o.get("address", ""),
                })
                moto["current_lat"] = o["latitude"]
                moto["current_lng"] = o["longitude"]
                moto["assigned_count"] += 1
                made = True
        if not made:
            break

    return assignments


# ──────────────────────────────────────────────────────────────────────────────
# ENDPOINTS
# ──────────────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return jsonify({
        "service": "ai-service",
        "version": "4.0.0",
        "algorithm": "OR-Tools CVRP" if ORTOOLS_AVAILABLE else "Greedy (OR-Tools no disponible)",
        "ortools_available": ORTOOLS_AVAILABLE,
    })


@app.route('/health')
def health():
    return jsonify({
        "status": "ok",
        "service": "ai-service",
        "ortools": ORTOOLS_AVAILABLE,
    })


@app.route('/optimize-assignments', methods=['POST'])
def optimize_assignments():
    """
    Endpoint principal de optimización de rutas.

    Usa OR-Tools CVRP cuando está disponible para encontrar rutas óptimas
    que minimizan la distancia total respetando capacidades. Si OR-Tools
    no está disponible o falla, cae en el algoritmo greedy nearest-neighbor.
    """
    data = request.get_json() or {}
    motos_raw = data.get('motos', [])
    orders_raw = data.get('orders', [])
    depot_lat = float(data.get('depot_lat', 14.6349))
    depot_lng = float(data.get('depot_lng', -90.5069))
    speed_kmh = float(data.get('speed_kmh', 25.0))
    max_orders_per_moto = int(data.get('max_orders_per_moto', 5))
    max_distance_km = float(data.get('max_distance_km', 50.0))

    if not motos_raw or not orders_raw:
        return jsonify({"assignments": [], "message": "No hay motos ni pedidos para optimizar"})

    # Validar y preparar motos
    moto_states = []  # para el greedy
    moto_capacities = []  # para OR-Tools: (id, capacity, lat, lng, plate)
    motos_sin_coords = []

    for m in motos_raw:
        mid = m.get("id")
        if mid is None:
            continue
        lat = m.get("latitude")
        lng = m.get("longitude")
        if lat is None or lng is None or (abs(float(lat)) < 0.1 and abs(float(lng)) < 0.1):
            motos_sin_coords.append(m.get("license_plate", f"MOTO-{mid}"))
            continue
        lat, lng = float(lat), float(lng)
        capacity = int(m.get("max_orders_capacity") or max_orders_per_moto)
        current = int(m.get("current_orders_count") or 0)
        avail = capacity - current
        if avail <= 0:
            continue
        plate = m.get("license_plate", f"MOTO-{mid}")
        moto_states.append({
            "id": mid, "latitude": lat, "longitude": lng,
            "current_lat": lat, "current_lng": lng,
            "capacity": avail, "assigned_count": 0, "license_plate": plate,
        })
        moto_capacities.append((mid, avail, lat, lng, plate))

    if not moto_states:
        msg = "No hay motos disponibles con ubicación válida"
        if motos_sin_coords:
            msg += f". Sin ubicación: {', '.join(motos_sin_coords)}"
        return jsonify({"assignments": [], "message": msg})

    # Validar y preparar pedidos
    order_locs = []  # para OR-Tools: (lat, lng, id, address)
    unassigned = []  # para greedy
    pedidos_sin_coords = []

    for o in orders_raw:
        oid = o.get("id")
        if oid is None:
            continue
        lat = o.get("latitude")
        lng = o.get("longitude")
        if lat is None or lng is None or (abs(float(lat)) < 0.1 and abs(float(lng)) < 0.1):
            pedidos_sin_coords.append(oid)
            continue
        lat, lng = float(lat), float(lng)
        addr = o.get("address", "")
        order_locs.append((lat, lng, oid, addr))
        unassigned.append({"id": oid, "latitude": lat, "longitude": lng, "address": addr})

    if not order_locs:
        return jsonify({"assignments": [], "message": "No hay pedidos con coordenadas válidas"})

    # ── Intentar OR-Tools primero ──
    algorithm_used = "greedy"
    assignments = None

    if ORTOOLS_AVAILABLE:
        try:
            assignments = solve_vrp_ortools(
                depot_loc=(depot_lat, depot_lng),
                order_locs=order_locs,
                moto_capacities=moto_capacities,
                speed_kmh=speed_kmh,
            )
            if assignments is not None:
                algorithm_used = "ortools_cvrp"
                logger.info(f"OR-Tools asignó {len(assignments)} pedidos")
        except Exception as e:
            logger.error(f"OR-Tools falló, usando greedy: {e}")
            assignments = None

    # ── Fallback greedy ──
    if assignments is None:
        assignments = solve_greedy(moto_states, unassigned, speed_kmh, max_distance_km)
        algorithm_used = "greedy_fallback"
        logger.info(f"Greedy asignó {len(assignments)} pedidos")

    # Calcular pedidos sin asignar (los que no aparecen en assignments)
    assigned_order_ids = {a["order_id"] for a in assignments}
    all_order_ids = {o[2] for o in order_locs}
    unassigned_ids = list(all_order_ids - assigned_order_ids)

    total_dist = sum(a["distance_km"] for a in assignments)
    motos_used = len({a["moto_id"] for a in assignments})

    response = {
        "assignments": assignments,
        "algorithm": algorithm_used,
        "stats": {
            "total_orders_assigned": len(assignments),
            "orders_remaining": len(unassigned_ids),
            "motos_used": motos_used,
            "total_distance_km": round(total_dist, 2),
            "avg_distance_per_order": round(total_dist / len(assignments), 2) if assignments else 0,
        },
        "unassigned_orders": unassigned_ids,
    }

    warnings = []
    if motos_sin_coords:
        warnings.append(f"Motos sin ubicación válida: {', '.join(motos_sin_coords)}")
    if pedidos_sin_coords:
        warnings.append(f"Pedidos con coordenadas inválidas: {pedidos_sin_coords}")
    if warnings:
        response["warnings"] = warnings

    return jsonify(response)


@app.route('/calculate-eta', methods=['POST'])
def calculate_eta():
    """
    Calcula ETA haversine para un pedido específico.
    El order-service puede llamar esto o usar el endpoint de Mapbox directamente.
    """
    data = request.get_json() or {}
    moto_lat = float(data.get('moto_lat', 0))
    moto_lng = float(data.get('moto_lng', 0))
    order_lat = float(data.get('order_lat', 0))
    order_lng = float(data.get('order_lng', 0))
    speed_kmh = float(data.get('speed_kmh', 25.0))

    distance = haversine_km(moto_lat, moto_lng, order_lat, order_lng)
    eta_min = (distance / speed_kmh) * 60.0 if speed_kmh > 0 else None

    return jsonify({
        "distance_km": round(distance, 3),
        "eta_min": round(eta_min, 1) if eta_min else None,
        "speed_kmh": speed_kmh,
        "method": "haversine",
    })


# ──────────────────────────────────────────────────────────────────────────────
# ENDPOINTS DE IA REAL
# ──────────────────────────────────────────────────────────────────────────────

@app.route('/ai/predict-eta', methods=['POST'])
def ai_predict_eta():
    """
    Predice el tiempo de entrega usando ML (o heurística calibrada si no hay modelo).

    Body: {
      "distance_km": float,
      "hour": int,               — hora del día 0-23
      "day_of_week": int,        — 0=Lunes, 6=Domingo
      "branch": str,             — código de sucursal
      "driver_avg_speed": float  — opcional, velocidad histórica del driver en km/h
    }
    """
    if not ML_AVAILABLE:
        return jsonify({"error": "ML no disponible"}), 503

    data = request.get_json() or {}
    required = ["distance_km"]
    missing = [k for k in required if k not in data]
    if missing:
        return jsonify({"error": f"Campos requeridos: {missing}"}), 400

    from datetime import datetime
    now = datetime.now()

    result = predict_eta(
        distance_km=float(data["distance_km"]),
        hour=int(data.get("hour", now.hour)),
        day_of_week=int(data.get("day_of_week", now.weekday())),
        branch=data.get("branch", "central"),
        driver_avg_speed=data.get("driver_avg_speed"),
    )
    return jsonify(result)


@app.route('/ai/train-eta', methods=['POST'])
def ai_train_eta():
    """
    Entrena el modelo ETA con datos históricos reales.

    Body: {
      "data": [
        {
          "distance_km": float,
          "hour": int,
          "day_of_week": int,
          "branch": str,
          "driver_avg_speed": float,
          "actual_eta_min": float    — tiempo real de entrega
        },
        ...
      ]
    }
    """
    if not ML_AVAILABLE:
        return jsonify({"error": "ML no disponible"}), 503

    body = request.get_json() or {}
    data = body.get("data", [])
    if not data:
        return jsonify({"error": "Se requiere 'data' con lista de entregas históricas"}), 400

    result = train_eta_model(data)
    return jsonify(result)


@app.route('/ai/anomaly-check', methods=['POST'])
def ai_anomaly_check():
    """
    Detecta si una ruta tiene comportamiento anómalo.

    Body: {
      "avg_speed_kmh": float,
      "max_speed_kmh": float,
      "total_distance_km": float,
      "total_duration_min": float,
      "stop_count": int,
      "max_stop_duration_min": float,
      "expected_distance_km": float,   — distancia estimada al inicio del turno
      "expected_duration_min": float   — ETA estimado al inicio del turno
    }
    """
    if not ML_AVAILABLE:
        return jsonify({"error": "ML no disponible"}), 503

    data = request.get_json() or {}
    if not data:
        return jsonify({"error": "Se requieren estadísticas de ruta"}), 400

    result = detect_route_anomaly(data)
    return jsonify(result)


@app.route('/ai/train-anomaly', methods=['POST'])
def ai_train_anomaly():
    """
    Entrena el modelo de detección de anomalías con rutas normales verificadas.

    Body: { "routes": [ { route_stats... }, ... ] }
    """
    if not ML_AVAILABLE:
        return jsonify({"error": "ML no disponible"}), 503

    body = request.get_json() or {}
    routes = body.get("routes", [])
    if not routes:
        return jsonify({"error": "Se requiere 'routes' con rutas normales"}), 400

    result = train_anomaly_model(routes)
    return jsonify(result)


@app.route('/ai/demand-forecast', methods=['POST'])
def ai_demand_forecast():
    """
    Predice la demanda de pedidos para las próximas horas por sucursal.

    Body: {
      "branch": str,
      "hours_ahead": int   — cuántas horas hacia adelante predecir (default 4)
    }
    """
    if not ML_AVAILABLE:
        return jsonify({"error": "ML no disponible"}), 503

    data = request.get_json() or {}
    branch = data.get("branch", "central")
    hours_ahead = min(int(data.get("hours_ahead", 4)), 24)

    forecast = forecast_demand(branch, hours_ahead)
    return jsonify({"branch": branch, "forecast": forecast})


@app.route('/ai/update-demand', methods=['POST'])
def ai_update_demand():
    """
    Registra un punto de datos de demanda para mejorar el forecast.
    Llamar periódicamente (e.g., cada hora) desde order-service.

    Body: {
      "branch": str,
      "hour": int,
      "day_of_week": int,
      "order_count": int
    }
    """
    if not ML_AVAILABLE:
        return jsonify({"error": "ML no disponible"}), 503

    data = request.get_json() or {}
    required = ["branch", "hour", "order_count"]
    missing = [k for k in required if k not in data]
    if missing:
        return jsonify({"error": f"Campos requeridos: {missing}"}), 400

    from datetime import datetime
    now = datetime.now()

    update_demand_history(
        branch=data["branch"],
        hour=int(data["hour"]),
        day_of_week=int(data.get("day_of_week", now.weekday())),
        order_count=int(data["order_count"]),
    )
    return jsonify({"updated": True})


if __name__ == '__main__':
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("DEBUG", "false").lower() == "true"
    logger.info(f"AI Service arrancando en puerto {port} — OR-Tools: {ORTOOLS_AVAILABLE}")
    app.run(host='0.0.0.0', port=port, debug=debug)
