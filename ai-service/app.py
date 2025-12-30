"""
AI Service - Logitrack Route Optimization
Version: 3.0.0 - Force redeploy Dec 2024
"""

from flask import Flask, request, jsonify
import math
import os

app = Flask(__name__)


@app.route('/')
def hello():
	return "AI Service - Logitrack Route Optimization"


@app.route('/health')
def health():
	return jsonify({"status": "ok", "service": "ai-service"})


def haversine_km(lat1, lon1, lat2, lon2):
	"""Great-circle distance between two points (km)."""
	R = 6371.0
	phi1 = math.radians(lat1)
	phi2 = math.radians(lat2)
	dphi = math.radians(lat2 - lat1)
	dlambda = math.radians(lon2 - lon1)
	a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
	c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
	return R * c


@app.route('/optimize-assignments', methods=['POST'])
def optimize_assignments():
	"""
	Algoritmo de asignación balanceada Round-Robin.
	
	Mejoras sobre el algoritmo anterior (Greedy):
	1. Distribuye pedidos equitativamente entre motos disponibles
	2. Respeta la capacidad máxima de cada moto
	3. Considera la ubicación actual de cada moto (o su sucursal)
	4. Asigna el pedido más cercano a cada moto en cada ronda
	5. Valida distancia máxima razonable (50km por defecto)
	"""
	data = request.get_json() or {}
	motos = data.get('motos', [])
	orders = data.get('orders', [])
	depot_lat = float(data.get('depot_lat', 14.6349))  # Guatemala Ciudad por defecto
	depot_lng = float(data.get('depot_lng', -90.5069))
	speed_kmh = float(data.get('speed_kmh', 25.0))
	max_orders_per_moto = int(data.get('max_orders_per_moto', 5))
	max_distance_km = float(data.get('max_distance_km', 50.0))  # Distancia máxima razonable

	if not motos or not orders:
		return jsonify({"assignments": [], "message": "No motos or orders to optimize"})

	# Preparar estructura de motos con su ubicación y capacidad
	moto_states = []
	motos_without_coords = []
	
	for m in motos:
		moto_id = m.get("id")
		if moto_id is None:
			continue
		
		# Obtener ubicación - DEBE tener coordenadas válidas
		lat = m.get("latitude")
		lng = m.get("longitude")
		
		# Si no tiene coordenadas, registrar advertencia y saltar
		if lat is None or lng is None:
			motos_without_coords.append(m.get("license_plate", f"MOTO-{moto_id}"))
			continue
		
		lat = float(lat)
		lng = float(lng)
		
		# Validar coordenadas (no pueden ser 0,0 o valores absurdos)
		if abs(lat) < 0.1 and abs(lng) < 0.1:
			motos_without_coords.append(m.get("license_plate", f"MOTO-{moto_id}"))
			continue
		
		# Capacidad: respetar max_orders_capacity si viene, sino usar default
		capacity = int(m.get("max_orders_capacity") or max_orders_per_moto)
		current_count = int(m.get("current_orders_count") or 0)
		available_capacity = capacity - current_count
		
		if available_capacity > 0:
			moto_states.append({
				"id": moto_id,
				"latitude": lat,
				"longitude": lng,
				"current_lat": lat,  # Posición que se actualiza con cada asignación
				"current_lng": lng,
				"capacity": available_capacity,
				"assigned_count": 0,
				"license_plate": m.get("license_plate", f"MOTO-{moto_id}")
			})

	if not moto_states:
		msg = "No hay motos disponibles con ubicación válida"
		if motos_without_coords:
			msg += f". Motos sin ubicación: {', '.join(motos_without_coords)}"
		return jsonify({"assignments": [], "message": msg})

	# Copia mutable de pedidos
	unassigned = []
	orders_with_invalid_coords = []
	
	for o in orders:
		if o.get("id") is None:
			continue
		lat = o.get("latitude")
		lng = o.get("longitude")
		
		# Validar coordenadas del pedido
		if lat is None or lng is None or (abs(float(lat)) < 0.1 and abs(float(lng)) < 0.1):
			orders_with_invalid_coords.append(o.get("id"))
			continue
			
		unassigned.append({
			"id": o.get("id"),
			"latitude": float(lat),
			"longitude": float(lng),
			"address": o.get("address", ""),
		})

	assignments = []
	skipped_too_far = []
	
	# ========================================
	# ALGORITMO ROUND-ROBIN BALANCEADO
	# ========================================
	# En cada ronda, cada moto recibe su pedido más cercano
	# Se repite hasta que no queden pedidos o capacidad
	
	round_num = 0
	max_rounds = 100  # Prevenir loops infinitos
	
	while unassigned and round_num < max_rounds:
		round_num += 1
		made_assignment = False
		
		for moto in moto_states:
			# Si esta moto ya alcanzó su capacidad, saltar
			if moto["assigned_count"] >= moto["capacity"]:
				continue
			
			if not unassigned:
				break
			
			# Encontrar el pedido más cercano a la posición actual de esta moto
			best_idx = None
			best_dist = None
			
			for idx, order in enumerate(unassigned):
				d = haversine_km(
					moto["current_lat"], moto["current_lng"],
					order["latitude"], order["longitude"]
				)
				
				# Solo considerar si está dentro del rango máximo
				if d <= max_distance_km:
					if best_dist is None or d < best_dist:
						best_dist = d
						best_idx = idx
			
			if best_idx is not None:
				best_order = unassigned.pop(best_idx)
				eta_min = (best_dist / speed_kmh) * 60.0 if speed_kmh > 0 else None
				
				assignments.append({
					"order_id": best_order["id"],
					"moto_id": moto["id"],
					"moto_plate": moto["license_plate"],
					"distance_km": round(best_dist, 3),
					"eta_min": round(eta_min, 1) if eta_min is not None else None,
					"order_address": best_order["address"],
				})
				
				# Actualizar estado de la moto
				moto["current_lat"] = best_order["latitude"]
				moto["current_lng"] = best_order["longitude"]
				moto["assigned_count"] += 1
				made_assignment = True
		
		# Si en esta ronda no se pudo asignar nada, salir
		if not made_assignment:
			break
	
	# Identificar pedidos que quedaron sin asignar por estar muy lejos
	for order in unassigned:
		min_dist = min(
			haversine_km(m["latitude"], m["longitude"], order["latitude"], order["longitude"])
			for m in moto_states
		) if moto_states else 999999
		if min_dist > max_distance_km:
			skipped_too_far.append({"order_id": order["id"], "min_distance_km": round(min_dist, 1)})
	
	# Estadísticas de la optimización
	total_distance = sum(a["distance_km"] for a in assignments)
	motos_used = len(set(a["moto_id"] for a in assignments))
	
	response = {
		"assignments": assignments,
		"stats": {
			"total_orders_assigned": len(assignments),
			"orders_remaining": len(unassigned),
			"motos_used": motos_used,
			"total_distance_km": round(total_distance, 2),
			"avg_distance_per_order": round(total_distance / len(assignments), 2) if assignments else 0,
		},
		"unassigned_orders": [o["id"] for o in unassigned],
	}
	
	# Agregar advertencias si hay problemas
	warnings = []
	if motos_without_coords:
		warnings.append(f"Motos sin ubicación válida: {', '.join(motos_without_coords)}")
	if orders_with_invalid_coords:
		warnings.append(f"Pedidos con coordenadas inválidas: {orders_with_invalid_coords}")
	if skipped_too_far:
		warnings.append(f"Pedidos muy lejos (>{max_distance_km}km): {[s['order_id'] for s in skipped_too_far]}")
	
	if warnings:
		response["warnings"] = warnings
	
	return jsonify(response)


@app.route('/calculate-eta', methods=['POST'])
def calculate_eta():
	"""Calcula ETA para un pedido específico basado en ubicación de moto."""
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
	})


if __name__ == '__main__':
	port = int(os.getenv("PORT", "5000"))
	debug = os.getenv("DEBUG", "false").lower() == "true"
	app.run(host='0.0.0.0', port=port, debug=debug)
