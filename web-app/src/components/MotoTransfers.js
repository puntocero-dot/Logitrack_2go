import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ORDER_API_BASE_URL } from '../config/api';

const MotoTransfers = () => {
    const [motos, setMotos] = useState([]);
    const [branches, setBranches] = useState([]);
    const [transfers, setTransfers] = useState([]);
    const [history, setHistory] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [selectedMoto, setSelectedMoto] = useState(null);
    const [transferData, setTransferData] = useState({
        to_branch_id: '',
        duration_hours: 8,
        reason: ''
    });
    const [message, setMessage] = useState({ type: '', text: '' });
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState('active'); // active, history

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [motosRes, branchesRes, transfersRes, historyRes] = await Promise.all([
                axios.get(`${ORDER_API_BASE_URL}/motos`),
                axios.get(`${ORDER_API_BASE_URL}/branches`),
                axios.get(`${ORDER_API_BASE_URL}/transfers`),
                axios.get(`${ORDER_API_BASE_URL}/transfers/history?limit=20`)
            ]);
            setMotos(motosRes.data || []);
            setBranches(branchesRes.data || []);
            setTransfers(transfersRes.data || []);
            setHistory(historyRes.data || []);
        } catch (err) {
            console.error('Error fetching data', err);
        }
    };

    const openTransferModal = (moto) => {
        setSelectedMoto(moto);
        setTransferData({
            to_branch_id: '',
            duration_hours: 8,
            reason: ''
        });
        setShowModal(true);
    };

    const handleTransfer = async () => {
        if (!transferData.to_branch_id) {
            setMessage({ type: 'error', text: 'Selecciona una sucursal destino' });
            return;
        }

        setLoading(true);
        try {
            await axios.post(`${ORDER_API_BASE_URL}/transfers`, {
                moto_id: selectedMoto.id,
                to_branch_id: parseInt(transferData.to_branch_id),
                duration_hours: transferData.duration_hours,
                reason: transferData.reason
            });
            setMessage({ type: 'success', text: `✅ ${selectedMoto.license_plate} transferida exitosamente` });
            setShowModal(false);
            fetchData();
        } catch (err) {
            setMessage({ type: 'error', text: 'Error: ' + (err.response?.data?.error || err.message) });
        }
        setLoading(false);
    };

    const handleReturn = async (motoId, licensePlate) => {
        if (!window.confirm(`¿Regresar ${licensePlate} a su sucursal original?`)) return;

        setLoading(true);
        try {
            await axios.put(`${ORDER_API_BASE_URL}/motos/${motoId}/return`);
            setMessage({ type: 'success', text: `✅ ${licensePlate} regresada a su sucursal` });
            fetchData();
        } catch (err) {
            setMessage({ type: 'error', text: 'Error: ' + (err.response?.data?.error || err.message) });
        }
        setLoading(false);
    };

    const getBranchName = (branchId) => {
        const branch = branches.find(b => b.id === branchId);
        return branch ? branch.name : `ID: ${branchId}`;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('es-GT', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const availableMotos = motos.filter(m => !m.is_transferred && m.status === 'available');
    const transferredMotos = transfers || [];

    return (
        <div className="dashboard-shell">
            <div className="dashboard-inner">
                <div className="dashboard-header">
                    <h2 className="dashboard-title">🔄 Transferencias de Motos</h2>
                    <div className="metrics-row">
                        <button
                            className={`btn ${view === 'active' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setView('active')}
                        >
                            🏍️ Motos Disponibles ({availableMotos.length})
                        </button>
                        <button
                            className={`btn ${view === 'transferred' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setView('transferred')}
                        >
                            🔄 Transferidas ({transferredMotos.length})
                        </button>
                        <button
                            className={`btn ${view === 'history' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setView('history')}
                        >
                            📜 Historial
                        </button>
                    </div>
                </div>

                {message.text && (
                    <div className={`alert ${message.type === 'error' ? 'alert--error' : 'alert--success'}`}
                        onClick={() => setMessage({ type: '', text: '' })}>
                        {message.text}
                    </div>
                )}

                {/* MOTOS DISPONIBLES PARA TRANSFERIR */}
                {view === 'active' && (
                    <div className="table-wrapper">
                        <h3>🏍️ Motos Disponibles para Transferir</h3>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Placa</th>
                                    <th>Sucursal Actual</th>
                                    <th>Estado</th>
                                    <th>Capacidad</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {availableMotos.map(moto => (
                                    <tr key={moto.id}>
                                        <td><strong>{moto.license_plate}</strong></td>
                                        <td>{getBranchName(moto.branch_id)}</td>
                                        <td>
                                            <span className="badge-status badge-success">
                                                Disponible
                                            </span>
                                        </td>
                                        <td>{moto.current_orders_count || 0} / {moto.max_orders_capacity || 5}</td>
                                        <td>
                                            <button
                                                className="btn btn-primary"
                                                onClick={() => openTransferModal(moto)}
                                                style={{ padding: '0.5rem 1rem' }}
                                            >
                                                🔄 Transferir
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {availableMotos.length === 0 && (
                                    <tr>
                                        <td colSpan="5" style={{ textAlign: 'center', color: '#9ca3af' }}>
                                            No hay motos disponibles para transferir
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* MOTOS TRANSFERIDAS */}
                {view === 'transferred' && (
                    <div className="table-wrapper">
                        <h3>🔄 Motos Actualmente Transferidas</h3>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Placa</th>
                                    <th>Sucursal Original</th>
                                    <th>Sucursal Actual</th>
                                    <th>Expira</th>
                                    <th>Motivo</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transferredMotos.map(t => (
                                    <tr key={t.moto_id}>
                                        <td><strong>{t.license_plate}</strong></td>
                                        <td>{t.home_branch_name}</td>
                                        <td>
                                            <span className="badge-status badge-warning">
                                                {t.current_branch_name}
                                            </span>
                                        </td>
                                        <td>{t.expires_at ? formatDate(t.expires_at) : 'Permanente'}</td>
                                        <td>{t.reason || '-'}</td>
                                        <td>
                                            <button
                                                className="btn btn-secondary"
                                                onClick={() => handleReturn(t.moto_id, t.license_plate)}
                                                disabled={loading}
                                                style={{ padding: '0.5rem 1rem' }}
                                            >
                                                ↩️ Regresar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {transferredMotos.length === 0 && (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', color: '#9ca3af' }}>
                                            No hay motos transferidas actualmente
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* HISTORIAL */}
                {view === 'history' && (
                    <div className="table-wrapper">
                        <h3>📜 Historial de Transferencias</h3>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Placa</th>
                                    <th>De</th>
                                    <th>A</th>
                                    <th>Tipo</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map(h => (
                                    <tr key={h.id}>
                                        <td>{formatDate(h.started_at)}</td>
                                        <td><strong>{h.license_plate}</strong></td>
                                        <td>{h.from_branch_name}</td>
                                        <td>{h.to_branch_name}</td>
                                        <td>{h.transfer_type === 'temporary' ? '⏱️ Temporal' : '📌 Permanente'}</td>
                                        <td>
                                            <span className={`badge-status ${h.status === 'completed' ? 'badge-success' : h.status === 'active' ? 'badge-warning' : 'badge-error'}`}>
                                                {h.status === 'completed' ? 'Completada' : h.status === 'active' ? 'Activa' : 'Cancelada'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {history.length === 0 && (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', color: '#9ca3af' }}>
                                            Sin historial de transferencias
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* MODAL DE TRANSFERENCIA */}
                {showModal && selectedMoto && (
                    <div className="modal-overlay" onClick={() => setShowModal(false)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <h3>🔄 Transferir Moto</h3>
                            <p style={{ color: '#9ca3af', marginBottom: '1.5rem' }}>
                                Moto: <strong>{selectedMoto.license_plate}</strong>
                                <br />
                                Sucursal actual: <strong>{getBranchName(selectedMoto.branch_id)}</strong>
                            </p>

                            <div style={{ display: 'grid', gap: '1rem' }}>
                                <div>
                                    <label>Sucursal Destino *</label>
                                    <select
                                        value={transferData.to_branch_id}
                                        onChange={e => setTransferData({ ...transferData, to_branch_id: e.target.value })}
                                        className="form-select"
                                    >
                                        <option value="">-- Selecciona --</option>
                                        {branches
                                            .filter(b => b.id !== selectedMoto.branch_id)
                                            .map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))
                                        }
                                    </select>
                                </div>

                                <div>
                                    <label>Duración (horas)</label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {[4, 8, 12, 24, 0].map(h => (
                                            <button
                                                key={h}
                                                className={`btn ${transferData.duration_hours === h ? 'btn-primary' : 'btn-secondary'}`}
                                                onClick={() => setTransferData({ ...transferData, duration_hours: h })}
                                                style={{ flex: 1 }}
                                            >
                                                {h === 0 ? 'Permanente' : `${h}h`}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label>Motivo</label>
                                    <input
                                        type="text"
                                        value={transferData.reason}
                                        onChange={e => setTransferData({ ...transferData, reason: e.target.value })}
                                        placeholder="Ej: Alta demanda en sucursal destino"
                                        className="form-input"
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setShowModal(false)}
                                        style={{ flex: 1 }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleTransfer}
                                        disabled={loading || !transferData.to_branch_id}
                                        style={{ flex: 1 }}
                                    >
                                        {loading ? 'Procesando...' : '✅ Confirmar Transferencia'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-content {
          background: #1f2937;
          border-radius: 16px;
          padding: 2rem;
          max-width: 500px;
          width: 90%;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .modal-content h3 {
          margin-bottom: 0.5rem;
        }
        .modal-content label {
          display: block;
          margin-bottom: 0.5rem;
          color: #9ca3af;
          font-size: 0.9rem;
        }
      `}</style>
        </div>
    );
};

export default MotoTransfers;
