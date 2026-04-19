package handlers

import (
	"math"
	"testing"
	"time"
)

// ── haversineDistance ──────────────────────────────────────────────────────

func TestHaversineDistance_SamePoint(t *testing.T) {
	d := haversineDistance(13.6929, -89.2182, 13.6929, -89.2182)
	if d != 0 {
		t.Errorf("distancia entre el mismo punto debe ser 0, got %.6f", d)
	}
}

func TestHaversineDistance_KnownDistance(t *testing.T) {
	// San Salvador → Guatemala Ciudad ≈ 174 km en línea recta (haversine)
	d := haversineDistance(13.6929, -89.2182, 14.6349, -90.5069)
	if math.Abs(d-174) > 10 {
		t.Errorf("distancia SV→GT esperada ≈174 km, got %.1f km", d)
	}
}

func TestHaversineDistance_ShortDistance(t *testing.T) {
	// 1 km aprox: mover ~0.009 grados en latitud ≈ 1 km
	d := haversineDistance(13.6929, -89.2182, 13.7019, -89.2182)
	if d < 0.8 || d > 1.2 {
		t.Errorf("distancia corta esperada ≈1 km, got %.3f km", d)
	}
}

func TestHaversineDistance_Symmetric(t *testing.T) {
	d1 := haversineDistance(13.0, -89.0, 14.0, -90.0)
	d2 := haversineDistance(14.0, -90.0, 13.0, -89.0)
	if math.Abs(d1-d2) > 0.001 {
		t.Errorf("haversine debe ser simétrica: d1=%.6f, d2=%.6f", d1, d2)
	}
}

// ── speedMsToKmh ──────────────────────────────────────────────────────────

func TestSpeedMsToKmh(t *testing.T) {
	cases := []struct{ ms, expected float64 }{
		{0, 0},
		{1, 3.6},
		{10, 36},
		{27.78, 100.0}, // 100 km/h
	}
	for _, c := range cases {
		got := speedMsToKmh(c.ms)
		if math.Abs(got-c.expected) > 0.1 {
			t.Errorf("speedMsToKmh(%.2f) = %.2f, quería %.2f", c.ms, got, c.expected)
		}
	}
}

// ── calcAvgSpeed ──────────────────────────────────────────────────────────

func TestCalcAvgSpeed_Normal(t *testing.T) {
	// 30 km en 60 min = 30 km/h
	got := calcAvgSpeed(30.0, 3600)
	if math.Abs(got-30.0) > 0.1 {
		t.Errorf("calcAvgSpeed(30km, 3600s) = %.2f, esperaba 30.0", got)
	}
}

func TestCalcAvgSpeed_ZeroDuration(t *testing.T) {
	got := calcAvgSpeed(10.0, 0)
	if got != 0 {
		t.Errorf("calcAvgSpeed con duración 0 debe retornar 0, got %.2f", got)
	}
}

func TestCalcAvgSpeed_TinyDistance(t *testing.T) {
	got := calcAvgSpeed(0.001, 100)
	if got != 0 {
		t.Errorf("calcAvgSpeed con distancia < 0.01 debe retornar 0, got %.2f", got)
	}
}

// ── detectStops ───────────────────────────────────────────────────────────

func makePoint(lat, lng float64, minutesOffset int) RoutePoint {
	return RoutePoint{
		Latitude:  lat,
		Longitude: lng,
		Timestamp: time.Now().Add(time.Duration(minutesOffset) * time.Minute),
		PointType: "TRACKING",
	}
}

func TestDetectStops_NoPoints(t *testing.T) {
	stops := detectStops(nil)
	if len(stops) != 0 {
		t.Errorf("sin puntos debe retornar 0 paradas, got %d", len(stops))
	}
}

func TestDetectStops_NotEnoughPoints(t *testing.T) {
	pts := []RoutePoint{
		makePoint(13.69, -89.22, 0),
		makePoint(13.69, -89.22, 1),
	}
	stops := detectStops(pts)
	if len(stops) != 0 {
		t.Errorf("2 puntos no son suficientes para parada, got %d", len(stops))
	}
}

func TestDetectStops_ShortStop(t *testing.T) {
	// 3 puntos en mismo lugar pero solo 60s → NO es parada (mínimo 120s)
	base := time.Now()
	pts := []RoutePoint{
		{Latitude: 13.69, Longitude: -89.22, Timestamp: base, PointType: "TRACKING"},
		{Latitude: 13.69, Longitude: -89.22, Timestamp: base.Add(30 * time.Second), PointType: "TRACKING"},
		{Latitude: 13.69, Longitude: -89.22, Timestamp: base.Add(60 * time.Second), PointType: "TRACKING"},
	}
	stops := detectStops(pts)
	if len(stops) != 0 {
		t.Errorf("parada de 60s no debe detectarse, got %d paradas", len(stops))
	}
}

func TestDetectStops_ValidStop(t *testing.T) {
	// 5 puntos en mismo lugar durante 5 minutos → SÍ es parada
	base := time.Now()
	pts := []RoutePoint{}
	for i := 0; i < 5; i++ {
		pts = append(pts, RoutePoint{
			Latitude:  13.6900,
			Longitude: -89.2182,
			Timestamp: base.Add(time.Duration(i) * time.Minute),
			PointType: "TRACKING",
		})
	}
	stops := detectStops(pts)
	if len(stops) != 1 {
		t.Errorf("debe detectar 1 parada, got %d", len(stops))
	}
	if stops[0].DurationSeconds < 120 {
		t.Errorf("duración de parada debe ser ≥120s, got %d", stops[0].DurationSeconds)
	}
}

func TestDetectStops_MovingPoints(t *testing.T) {
	// Puntos moviéndose = sin paradas
	pts := []RoutePoint{
		makePoint(13.69, -89.22, 0),
		makePoint(13.71, -89.23, 2),
		makePoint(13.73, -89.24, 4),
		makePoint(13.75, -89.25, 6),
	}
	stops := detectStops(pts)
	if len(stops) != 0 {
		t.Errorf("puntos en movimiento no deben generar paradas, got %d", len(stops))
	}
}

// ── isAnchorType (segments) ───────────────────────────────────────────────

func TestIsAnchorType(t *testing.T) {
	anchors := []string{"START", "DELIVERY", "END"}
	for _, a := range anchors {
		if !isAnchorType(a) {
			t.Errorf("%s debe ser punto ancla", a)
		}
	}
	nonAnchors := []string{"TRACKING", "PAUSE", "", "tracking"}
	for _, n := range nonAnchors {
		if isAnchorType(n) {
			t.Errorf("%s NO debe ser punto ancla", n)
		}
	}
}
