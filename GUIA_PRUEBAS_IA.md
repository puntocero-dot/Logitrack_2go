# 🚀 Guía de Pruebas - Sistema de Asignación Inteligente

## Requisitos Previos
1. **Docker Desktop** debe estar corriendo
2. Terminal PowerShell

---

## 🔄 Paso 1: Levantar el Entorno

### Opción A: Desde cero (primera vez o reset completo)
```powershell
cd C:\Users\DELL\Desktop\Proyectos\Logitrack

# Detener contenedores existentes
docker-compose down -v

# Reconstruir TODO (forzar rebuild)
docker-compose up --build -d

# Ver logs en tiempo real
docker-compose logs -f
```

### Opción B: Solo actualizar servicios modificados
```powershell
cd C:\Users\DELL\Desktop\Proyectos\Logitrack

# Rebuild servicios específicos
docker-compose build order-service ai-service api-gateway web-app

# Reiniciar
docker-compose up -d
```

---

## 🧪 Paso 2: Ejecutar Prueba de Asignación

```powershell
# Ejecutar script de prueba
./test-ai-assignment.ps1
```

### ¿Qué hace el script?
1. Verifica sucursales existentes
2. Crea 3 motos de prueba con ubicaciones diferentes
3. Crea 3 pedidos de prueba en diferentes zonas
4. Ejecuta el algoritmo de optimización
5. Muestra las asignaciones sugeridas
6. Opcionalmente aplica las asignaciones

---

## 🤖 Paso 3: Cómo Funciona el Algoritmo de IA

### Algoritmo Anterior (Greedy/Voraz)
```
❌ Problema: Tomaba la primera moto y le asignaba TODOS los pedidos
   Moto 1: 5 pedidos
   Moto 2: 0 pedidos
   Moto 3: 0 pedidos
```

### Algoritmo Nuevo (Round-Robin Balanceado)
```
✅ Solución: Distribuye pedidos equitativamente entre motos

RONDA 1:
  → Moto 1 recibe su pedido más cercano
  → Moto 2 recibe su pedido más cercano
  → Moto 3 recibe su pedido más cercano

RONDA 2:
  → Moto 1 recibe otro pedido (si tiene capacidad)
  → Moto 2 recibe otro pedido (si tiene capacidad)
  → ...y así sucesivamente
```

### Factores que considera:
1. **Ubicación real de cada moto** (lat/lng)
2. **Capacidad máxima** de pedidos por moto
3. **Carga actual** (pedidos ya asignados)
4. **Distancia** al pedido (fórmula Haversine)
5. **ETA estimado** (distancia / velocidad promedio)

---

## 📊 Ejemplo de Resultado Esperado

```
🤖 PASO 4: Ejecutando algoritmo de optimización...
   ✅ Sugerencias generadas: 3

   ASIGNACIONES SUGERIDAS:
   ========================
   Pedido #101 → Moto TEST-002
      Distancia: 0.85 km | ETA: 2.0 min

   Pedido #102 → Moto TEST-003
      Distancia: 0.72 km | ETA: 1.7 min

   Pedido #103 → Moto TEST-002
      Distancia: 1.23 km | ETA: 3.0 min

   ESTADÍSTICAS:
   - Pedidos asignados: 3
   - Motos utilizadas: 2
   - Distancia total: 2.80 km
   - Promedio por pedido: 0.93 km
```

---

## 🔍 Verificar desde el Frontend

1. Abre http://localhost:3001
2. Inicia sesión como admin
3. Ve a **Dashboard de Supervisor**
4. Clic en **"Optimizar asignación"**
5. Revisa las sugerencias en la tabla
6. Clic en **"Aplicar sugerencias"**

---

## 🛠️ Troubleshooting

### Error: "Docker no encontrado"
- Abre Docker Desktop y espera a que inicie completamente

### Error: "No hay motos disponibles"
- Las motos deben tener `status = 'available'`
- Las motos deben tener `current_orders_count < max_orders_capacity`

### Error: "No hay pedidos pendientes"
- Los pedidos deben tener `status = 'pending'`

### Los contenedores no inician
```powershell
# Ver logs de errores
docker-compose logs order-service
docker-compose logs ai-service
```

---

## 📁 Archivos Clave Modificados

| Archivo | Cambio |
|---------|--------|
| `init.sql` | Nueva tabla `branches`, columnas en `motos` |
| `ai-service/app.py` | Algoritmo Round-Robin |
| `order-service/handlers/moto.go` | CRUD completo con ubicación |
| `order-service/handlers/optimization.go` | Integración con IA mejorada |
| `web-app/src/components/AdminMotos.js` | Formulario con GPS |

---

## ✅ Checklist de Validación

- [ ] Sucursales se crean automáticamente
- [ ] Motos tienen ubicación (lat/lng)
- [ ] Pedidos pendientes aparecen
- [ ] Optimización genera sugerencias balanceadas
- [ ] Las asignaciones se aplican correctamente
- [ ] El contador de pedidos por moto se actualiza
