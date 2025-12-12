import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import Map, { Marker, NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './BranchesManagement.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api-gateway-production-ad21.up.railway.app';
// Fallback token si no está en variables de entorno
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || 'pk.eyJ1IjoibG9naXRyYWNrIiwiYSI6ImNtNHJvOXBhZzBhMXYybG9qMGxkMGZyYTkifQ.fmeq3YAtxTW94Y3083nAdw';

const BranchesManagement = () => {
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [filter, setFilter] = useState({ search: '', active: '' });
    const [form, setForm] = useState({
        name: '',
        code: '',
        address: '',
        latitude: '',
        longitude: '',
        radius_km: 10,
        is_active: true,
    });
    const [message, setMessage] = useState({ type: '', text: '' });
    const [addressSuggestions, setAddressSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [showMap, setShowMap] = useState(false);
    const [mapViewState, setMapViewState] = useState({
        longitude: -90.5069,
        latitude: 14.6349,
        zoom: 12
    });
    const debounceRef = useRef(null);

    useEffect(() => {
        fetchBranches();
    }, []);

    const fetchBranches = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/branches`);
            setBranches(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Error fetching branches', err);
            setBranches([]);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setForm({ ...form, [e.target.name]: value });
    };

    const handleFilterChange = (e) => {
        setFilter({ ...filter, [e.target.name]: e.target.value });
    };

    // Geocoding: buscar sugerencias de direcciones usando Nominatim (OpenStreetMap - gratis)
    const searchAddress = useCallback(async (query) => {
        if (!query || query.length < 3) {
            setAddressSuggestions([]);
            return;
        }
        setIsGeocoding(true);
        try {
            const res = await axios.get(
                'https://nominatim.openstreetmap.org/search',
                {
                    params: {
                        q: query,
                        format: 'json',
                        limit: 5,
                        addressdetails: 1
                    },
                    headers: {
                        'Accept-Language': 'es'
                    }
                }
            );
            // Transformar respuesta al formato esperado
            const suggestions = res.data.map(item => ({
                place_name: item.display_name,
                center: [parseFloat(item.lon), parseFloat(item.lat)]
            }));
            setAddressSuggestions(suggestions);
            setShowSuggestions(true);
        } catch (err) {
            console.error('Geocoding error:', err);
            setAddressSuggestions([]);
        } finally {
            setIsGeocoding(false);
        }
    }, []);

    // Manejar cambio en el campo de dirección con debounce
    const handleAddressChange = (e) => {
        const value = e.target.value;
        setForm({ ...form, address: value });

        // Debounce: esperar 500ms después de que el usuario deje de escribir
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
            searchAddress(value);
        }, 500);
    };

    // Seleccionar una sugerencia de dirección
    const selectAddressSuggestion = (suggestion) => {
        const [lng, lat] = suggestion.center;
        setForm({
            ...form,
            address: suggestion.place_name,
            latitude: lat.toFixed(6),
            longitude: lng.toFixed(6)
        });
        setShowSuggestions(false);
        setAddressSuggestions([]);
        // Centrar mapa en la ubicación seleccionada
        setMapViewState({ longitude: lng, latitude: lat, zoom: 15 });
    };

    // Click en el mapa para seleccionar ubicación
    const handleMapClick = useCallback(async (event) => {
        const { lngLat } = event;
        const lat = lngLat.lat;
        const lng = lngLat.lng;

        setForm(prev => ({
            ...prev,
            latitude: lat.toFixed(6),
            longitude: lng.toFixed(6)
        }));

        // Reverse geocoding con Nominatim (OpenStreetMap - gratis)
        try {
            const res = await axios.get(
                'https://nominatim.openstreetmap.org/reverse',
                {
                    params: {
                        lat: lat,
                        lon: lng,
                        format: 'json'
                    },
                    headers: {
                        'Accept-Language': 'es'
                    }
                }
            );
            if (res.data && res.data.display_name) {
                setForm(prev => ({
                    ...prev,
                    address: res.data.display_name
                }));
            }
        } catch (err) {
            console.error('Reverse geocoding error:', err);
        }
    }, []);

    const resetForm = () => {
        setForm({
            name: '',
            code: '',
            address: '',
            latitude: '',
            longitude: '',
            radius_km: 10,
            is_active: true,
        });
        setEditing(null);
        setShowForm(false);
        setMessage({ type: '', text: '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage({ type: '', text: '' });

        const payload = {
            name: form.name,
            code: form.code.toUpperCase(),
            address: form.address,
            latitude: parseFloat(form.latitude) || 0,
            longitude: parseFloat(form.longitude) || 0,
            radius_km: parseFloat(form.radius_km) || 10,
            is_active: form.is_active,
        };

        try {
            if (editing) {
                await axios.put(`${API_BASE_URL}/branches/${editing.id}`, payload);
                setMessage({ type: 'success', text: '✅ Sucursal actualizada correctamente.' });
            } else {
                await axios.post(`${API_BASE_URL}/branches`, payload);
                setMessage({ type: 'success', text: '✅ Sucursal creada correctamente.' });
            }
            resetForm();
            fetchBranches();
        } catch (err) {
            setMessage({ type: 'error', text: '❌ Error: ' + (err.response?.data?.error || err.message) });
        }
    };

    const handleEdit = (branch) => {
        setForm({
            name: branch.name || '',
            code: branch.code || '',
            address: branch.address || '',
            latitude: branch.latitude || '',
            longitude: branch.longitude || '',
            radius_km: branch.radius_km || 10,
            is_active: branch.is_active !== false,
        });
        setEditing(branch);
        setShowForm(true);
    };

    const handleToggleActive = async (branch) => {
        try {
            await axios.put(`${API_BASE_URL}/branches/${branch.id}/toggle`);
            setMessage({ type: 'success', text: `✅ Sucursal ${branch.is_active ? 'desactivada' : 'activada'}.` });
            fetchBranches();
        } catch (err) {
            setMessage({ type: 'error', text: '❌ Error al cambiar estado.' });
        }
    };

    const handleDelete = async (branch) => {
        if (!window.confirm(`¿Desactivar la sucursal "${branch.name}"? Los datos se conservarán.`)) return;
        try {
            await axios.delete(`${API_BASE_URL}/branches/${branch.id}`);
            setMessage({ type: 'success', text: '✅ Sucursal desactivada.' });
            fetchBranches();
        } catch (err) {
            setMessage({ type: 'error', text: '❌ Error al desactivar.' });
        }
    };

    const filteredBranches = branches.filter(branch => {
        if (filter.active === 'true' && !branch.is_active) return false;
        if (filter.active === 'false' && branch.is_active !== false) return false;
        if (filter.search) {
            const search = filter.search.toLowerCase();
            return (
                branch.name?.toLowerCase().includes(search) ||
                branch.code?.toLowerCase().includes(search) ||
                branch.address?.toLowerCase().includes(search)
            );
        }
        return true;
    });

    if (loading) {
        return (
            <div className="branches-management">
                <div className="loading-spinner">
                    <div className="spinner"></div>
                    <p>Cargando sucursales...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="branches-management">
            <div className="branches-header">
                <div className="header-content">
                    <h1>🏢 Gestión de Sucursales</h1>
                    <p>Administra las sucursales y puntos de operación</p>
                </div>
                <button className="btn-add" onClick={() => setShowForm(!showForm)}>
                    {showForm ? '✕ Cerrar' : '+ Nueva Sucursal'}
                </button>
            </div>

            {message.text && (
                <div className={`alert alert-${message.type}`}>
                    {message.text}
                </div>
            )}

            {/* Formulario de creación/edición */}
            {showForm && (
                <div className="branch-form-card">
                    <h3>{editing ? '✏️ Editar Sucursal' : '➕ Crear Nueva Sucursal'}</h3>
                    <form onSubmit={handleSubmit} className="branch-form">
                        <div className="form-row">
                            <div className="form-group">
                                <label>Nombre de la Sucursal *</label>
                                <input
                                    type="text"
                                    name="name"
                                    placeholder="Sucursal Centro"
                                    value={form.name}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Código (único) *</label>
                                <input
                                    type="text"
                                    name="code"
                                    placeholder="CENTRO"
                                    value={form.code}
                                    onChange={handleChange}
                                    required
                                    style={{ textTransform: 'uppercase' }}
                                />
                            </div>
                        </div>

                        <div className="form-group full-width address-autocomplete">
                            <label>Dirección {isGeocoding && <span className="geocoding-indicator">🔍</span>}</label>
                            <input
                                type="text"
                                name="address"
                                placeholder="Escribe una dirección para autocompletar coordenadas..."
                                value={form.address}
                                onChange={handleAddressChange}
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                autoComplete="off"
                            />
                            {showSuggestions && addressSuggestions.length > 0 && (
                                <ul className="address-suggestions">
                                    {addressSuggestions.map((s, idx) => (
                                        <li key={idx} onClick={() => selectAddressSuggestion(s)}>
                                            <span className="suggestion-icon">📍</span>
                                            <span className="suggestion-text">{s.place_name}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <button type="button" className="btn-map-toggle" onClick={() => setShowMap(!showMap)}>
                                {showMap ? '🗺️ Ocultar Mapa' : '🗺️ Seleccionar en Mapa'}
                            </button>
                        </div>

                        {/* Mapa interactivo */}
                        {showMap && (
                            <div className="map-picker-container">
                                <p className="map-hint">👆 Haz clic en el mapa para seleccionar la ubicación</p>
                                <div className="map-picker">
                                    <Map
                                        {...mapViewState}
                                        onMove={evt => setMapViewState(evt.viewState)}
                                        onClick={handleMapClick}
                                        style={{ width: '100%', height: '300px' }}
                                        mapStyle="mapbox://styles/mapbox/dark-v11"
                                        mapboxAccessToken={MAPBOX_TOKEN}
                                    >
                                        <NavigationControl position="top-right" />
                                        {form.latitude && form.longitude && (
                                            <Marker
                                                longitude={parseFloat(form.longitude)}
                                                latitude={parseFloat(form.latitude)}
                                                anchor="bottom"
                                            >
                                                <div className="map-marker">📍</div>
                                            </Marker>
                                        )}
                                    </Map>
                                </div>
                            </div>
                        )}

                        <div className="form-row">
                            <div className="form-group">
                                <label>Latitud</label>
                                <input
                                    type="number"
                                    name="latitude"
                                    placeholder="14.6349"
                                    value={form.latitude}
                                    onChange={handleChange}
                                    step="any"
                                />
                            </div>
                            <div className="form-group">
                                <label>Longitud</label>
                                <input
                                    type="number"
                                    name="longitude"
                                    placeholder="-90.5069"
                                    value={form.longitude}
                                    onChange={handleChange}
                                    step="any"
                                />
                            </div>
                            <div className="form-group">
                                <label>Radio de cobertura (km)</label>
                                <input
                                    type="number"
                                    name="radius_km"
                                    placeholder="10"
                                    value={form.radius_km}
                                    onChange={handleChange}
                                    min="1"
                                    max="100"
                                />
                            </div>
                        </div>

                        <div className="form-group checkbox-group">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    name="is_active"
                                    checked={form.is_active}
                                    onChange={handleChange}
                                />
                                <span className="checkmark"></span>
                                Sucursal activa
                            </label>
                        </div>

                        <div className="form-actions">
                            <button type="submit" className="btn-primary">
                                {editing ? '💾 Guardar Cambios' : '✅ Crear Sucursal'}
                            </button>
                            <button type="button" className="btn-secondary" onClick={resetForm}>
                                Cancelar
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Filtros */}
            <div className="filters-bar">
                <div className="filter-group">
                    <input
                        type="text"
                        name="search"
                        placeholder="🔍 Buscar por nombre, código o dirección..."
                        value={filter.search}
                        onChange={handleFilterChange}
                        className="search-input"
                    />
                </div>
                <div className="filter-group">
                    <select name="active" value={filter.active} onChange={handleFilterChange}>
                        <option value="">Todos los estados</option>
                        <option value="true">Activas</option>
                        <option value="false">Inactivas</option>
                    </select>
                </div>
            </div>

            {/* Estadísticas */}
            <div className="stats-row">
                <div className="stat-card">
                    <span className="stat-value">{branches.length}</span>
                    <span className="stat-label">Total Sucursales</span>
                </div>
                <div className="stat-card stat-active">
                    <span className="stat-value">{branches.filter(b => b.is_active !== false).length}</span>
                    <span className="stat-label">Activas</span>
                </div>
                <div className="stat-card stat-inactive">
                    <span className="stat-value">{branches.filter(b => b.is_active === false).length}</span>
                    <span className="stat-label">Inactivas</span>
                </div>
                <div className="stat-card">
                    <span className="stat-value">{filteredBranches.length}</span>
                    <span className="stat-label">Resultados</span>
                </div>
            </div>

            {/* Grid de Sucursales */}
            <div className="branches-grid">
                {filteredBranches.map(branch => (
                    <div key={branch.id} className={`branch-card ${branch.is_active === false ? 'inactive' : ''}`}>
                        <div className="branch-header">
                            <div className="branch-icon">🏢</div>
                            <div className="branch-info">
                                <h3>{branch.name}</h3>
                                <span className="branch-code">{branch.code}</span>
                            </div>
                            <span className={`status-badge ${branch.is_active !== false ? 'active' : 'inactive'}`}>
                                {branch.is_active !== false ? '✅ Activa' : '❌ Inactiva'}
                            </span>
                        </div>

                        <div className="branch-details">
                            <p className="branch-address">
                                <span className="icon">📍</span> {branch.address || 'Sin dirección'}
                            </p>
                            <div className="branch-coords">
                                <span><strong>Lat:</strong> {branch.latitude?.toFixed(4) || '-'}</span>
                                <span><strong>Lng:</strong> {branch.longitude?.toFixed(4) || '-'}</span>
                                <span><strong>Radio:</strong> {branch.radius_km || 10} km</span>
                            </div>
                        </div>

                        <div className="branch-actions">
                            <button
                                className="btn-icon btn-edit"
                                onClick={() => handleEdit(branch)}
                                title="Editar"
                            >
                                ✏️ Editar
                            </button>
                            <button
                                className={`btn-icon ${branch.is_active !== false ? 'btn-deactivate' : 'btn-activate'}`}
                                onClick={() => handleToggleActive(branch)}
                                title={branch.is_active !== false ? 'Desactivar' : 'Activar'}
                            >
                                {branch.is_active !== false ? '🔒 Desactivar' : '🔓 Activar'}
                            </button>
                        </div>
                    </div>
                ))}

                {filteredBranches.length === 0 && (
                    <div className="empty-state">
                        <span className="empty-icon">🏢</span>
                        <p>No se encontraron sucursales</p>
                        <button className="btn-add" onClick={() => setShowForm(true)}>
                            + Crear primera sucursal
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BranchesManagement;
