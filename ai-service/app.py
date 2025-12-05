from flask import Flask, request, jsonify
import math

app = Flask(__name__)


@app.route('/')
def hello():
	return "AI Service"


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
	data = request.get_json() or {}
	motos = data.get('motos', [])
	orders = data.get('orders', [])
	depot_lat = float(data.get('depot_lat', 0.0))
	depot_lng = float(data.get('depot_lng', 0.0))
	speed_kmh = float(data.get('speed_kmh', 25.0))  # velocidad media ciudad

	if not motos or not orders:
		return jsonify({"assignments": []})

	# Copia mutable de pedidos para ir asignando
	unassigned = [
		{
			"id": o.get("id"),
			"latitude": float(o.get("latitude", 0.0)),
			"longitude": float(o.get("longitude", 0.0)),
		}
		for o in orders
		if o.get("id") is not None
	]

	assignments = []

	for moto in motos:
		moto_id = moto.get("id")
		if moto_id is None:
			continue
		# Por ahora asumimos que todas las motos salen del mismo depósito
		current_lat = float(moto.get("latitude", depot_lat))
		current_lng = float(moto.get("longitude", depot_lng))

		while unassigned:
			best_idx = None
			best_dist = None
			for idx, order in enumerate(unassigned):
				d = haversine_km(current_lat, current_lng, order["latitude"], order["longitude"])
				if best_dist is None or d < best_dist:
					best_dist = d
					best_idx = idx

			if best_idx is None:
				break

			best_order = unassigned.pop(best_idx)
			eta_min = (best_dist / speed_kmh) * 60.0 if speed_kmh > 0 else None
			assignments.append({
				"order_id": best_order["id"],
				"moto_id": moto_id,
				"distance_km": round(best_dist, 3),
				"eta_min": round(eta_min, 1) if eta_min is not None else None,
			})
			current_lat = best_order["latitude"]
			current_lng = best_order["longitude"]

			if not unassigned:
				break

	return jsonify({"assignments": assignments})


if __name__ == '__main__':
	app.run(host='0.0.0.0', port=5000)
