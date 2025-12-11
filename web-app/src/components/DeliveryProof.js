import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { ORDER_API_BASE_URL } from '../config/api';

const DeliveryProof = ({ orderId, onComplete, onCancel }) => {
    const [step, setStep] = useState('signature'); // signature, photo, confirm
    const [signatureData, setSignatureData] = useState(null);
    const [photoData, setPhotoData] = useState(null);
    const [recipientName, setRecipientName] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const canvasRef = useRef(null);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

    // Inicializar canvas para firma
    useEffect(() => {
        if (step === 'signature' && canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
        }
    }, [step]);

    // Inicializar cámara
    useEffect(() => {
        if (step === 'photo') {
            startCamera();
        }
        return () => stopCamera();
    }, [step]);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                streamRef.current = stream;
            }
        } catch (err) {
            setError('No se pudo acceder a la cámara: ' + err.message);
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
    };

    // Funciones de dibujo
    const getPos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    };

    const startDraw = (e) => {
        e.preventDefault();
        setIsDrawing(true);
        setLastPos(getPos(e));
    };

    const draw = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const pos = getPos(e);
        const ctx = canvasRef.current.getContext('2d');
        ctx.beginPath();
        ctx.moveTo(lastPos.x, lastPos.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        setLastPos(pos);
    };

    const endDraw = () => {
        setIsDrawing(false);
    };

    const clearSignature = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    const saveSignature = () => {
        const canvas = canvasRef.current;
        const data = canvas.toDataURL('image/png');
        setSignatureData(data);
        setStep('photo');
    };

    const capturePhoto = () => {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        const data = canvas.toDataURL('image/jpeg', 0.8);
        setPhotoData(data);
        stopCamera();
        setStep('confirm');
    };

    const skipPhoto = () => {
        stopCamera();
        setStep('confirm');
    };

    const handleSubmit = async () => {
        if (!signatureData) {
            setError('La firma es requerida');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Enviar prueba de entrega al backend
            await axios.post(`${ORDER_API_BASE_URL}/orders/${orderId}/delivery-proof`, {
                signature_base64: signatureData,
                photo_base64: photoData,
                recipient_name: recipientName,
                notes: notes
            });

            // Actualizar estado del pedido a entregado
            await axios.put(`${ORDER_API_BASE_URL}/orders/${orderId}/status`, {
                status: 'delivered'
            });

            onComplete && onComplete();
        } catch (err) {
            setError('Error al guardar: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="delivery-proof-overlay">
            <div className="delivery-proof-modal">
                <div className="proof-header">
                    <h3>
                        {step === 'signature' && '✍️ Firma del Cliente'}
                        {step === 'photo' && '📸 Foto de Entrega'}
                        {step === 'confirm' && '✅ Confirmar Entrega'}
                    </h3>
                    <button className="close-btn" onClick={onCancel}>✕</button>
                </div>

                {error && <div className="proof-error">{error}</div>}

                {/* PASO 1: FIRMA */}
                {step === 'signature' && (
                    <div className="proof-content">
                        <p className="proof-instruction">Pide al cliente que firme en el recuadro:</p>
                        <div className="signature-container">
                            <canvas
                                ref={canvasRef}
                                width={350}
                                height={200}
                                onMouseDown={startDraw}
                                onMouseMove={draw}
                                onMouseUp={endDraw}
                                onMouseLeave={endDraw}
                                onTouchStart={startDraw}
                                onTouchMove={draw}
                                onTouchEnd={endDraw}
                            />
                        </div>
                        <input
                            type="text"
                            placeholder="Nombre de quien recibe"
                            value={recipientName}
                            onChange={(e) => setRecipientName(e.target.value)}
                            className="proof-input"
                        />
                        <div className="proof-actions">
                            <button className="btn btn-secondary" onClick={clearSignature}>
                                🗑️ Limpiar
                            </button>
                            <button className="btn btn-primary" onClick={saveSignature}>
                                Siguiente →
                            </button>
                        </div>
                    </div>
                )}

                {/* PASO 2: FOTO */}
                {step === 'photo' && (
                    <div className="proof-content">
                        <p className="proof-instruction">Toma una foto del paquete entregado:</p>
                        <div className="camera-container">
                            <video ref={videoRef} autoPlay playsInline />
                        </div>
                        <div className="proof-actions">
                            <button className="btn btn-secondary" onClick={skipPhoto}>
                                Omitir
                            </button>
                            <button className="btn btn-primary" onClick={capturePhoto}>
                                📸 Capturar
                            </button>
                        </div>
                    </div>
                )}

                {/* PASO 3: CONFIRMAR */}
                {step === 'confirm' && (
                    <div className="proof-content">
                        <p className="proof-instruction">Revisa los datos antes de confirmar:</p>

                        <div className="proof-preview">
                            <div className="preview-item">
                                <label>Firma:</label>
                                {signatureData && <img src={signatureData} alt="Firma" />}
                            </div>
                            {photoData && (
                                <div className="preview-item">
                                    <label>Foto:</label>
                                    <img src={photoData} alt="Entrega" />
                                </div>
                            )}
                            {recipientName && (
                                <div className="preview-item">
                                    <label>Recibió:</label>
                                    <span>{recipientName}</span>
                                </div>
                            )}
                        </div>

                        <textarea
                            placeholder="Notas adicionales (opcional)"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="proof-textarea"
                        />

                        <div className="proof-actions">
                            <button className="btn btn-secondary" onClick={() => setStep('signature')}>
                                ← Volver
                            </button>
                            <button className="btn btn-success" onClick={handleSubmit} disabled={loading}>
                                {loading ? 'Guardando...' : '✅ Confirmar Entrega'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
        .delivery-proof-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 1rem;
        }

        .delivery-proof-modal {
          background: #1f2937;
          border-radius: 20px;
          width: 100%;
          max-width: 420px;
          max-height: 90vh;
          overflow-y: auto;
          border: 1px solid rgba(255,255,255,0.1);
        }

        .proof-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .proof-header h3 {
          margin: 0;
          color: #f9fafb;
        }

        .close-btn {
          background: none;
          border: none;
          color: #9ca3af;
          font-size: 1.5rem;
          cursor: pointer;
        }

        .proof-error {
          background: #ef4444;
          color: white;
          padding: 0.75rem;
          margin: 1rem;
          border-radius: 8px;
          text-align: center;
        }

        .proof-content {
          padding: 1.25rem;
        }

        .proof-instruction {
          color: #9ca3af;
          margin-bottom: 1rem;
          text-align: center;
        }

        .signature-container {
          background: white;
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 1rem;
        }

        .signature-container canvas {
          display: block;
          width: 100%;
          touch-action: none;
          cursor: crosshair;
        }

        .camera-container {
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 1rem;
          background: #000;
        }

        .camera-container video {
          width: 100%;
          display: block;
        }

        .proof-input,
        .proof-textarea {
          width: 100%;
          padding: 0.75rem;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
          background: #111827;
          color: #f9fafb;
          font-size: 1rem;
          margin-bottom: 1rem;
        }

        .proof-textarea {
          min-height: 80px;
          resize: vertical;
        }

        .proof-actions {
          display: flex;
          gap: 1rem;
        }

        .proof-actions .btn {
          flex: 1;
          padding: 0.875rem;
          border: none;
          border-radius: 10px;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-success {
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
        }

        .btn-success:hover {
          transform: scale(1.02);
        }

        .btn-success:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .proof-preview {
          background: #111827;
          border-radius: 12px;
          padding: 1rem;
          margin-bottom: 1rem;
        }

        .preview-item {
          margin-bottom: 1rem;
        }

        .preview-item:last-child {
          margin-bottom: 0;
        }

        .preview-item label {
          display: block;
          color: #9ca3af;
          font-size: 0.85rem;
          margin-bottom: 0.5rem;
        }

        .preview-item img {
          width: 100%;
          border-radius: 8px;
        }

        .preview-item span {
          color: #f9fafb;
          font-weight: 500;
        }
      `}</style>
        </div>
    );
};

export default DeliveryProof;
