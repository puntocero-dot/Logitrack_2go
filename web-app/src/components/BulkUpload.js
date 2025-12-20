import React, { useState, useRef } from 'react';

/**
 * BulkUpload Component
 * Reusable CSV upload component with duplicate detection and result summary
 * 
 * Props:
 * - entityName: String - Name of the entity (e.g., "sucursales", "usuarios", "pedidos")
 * - templateColumns: Array - Column names for the template (e.g., ["name", "email", "role"])
 * - templateExample: Array - Example row for the template
 * - onUpload: Function - Async function that receives parsed data and returns { success: number, errors: Array, duplicates: number }
 * - duplicateKey: String - Key to check for duplicates (e.g., "email", "code")
 */
const BulkUpload = ({ entityName, templateColumns, templateExample, onUpload, duplicateKey }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [file, setFile] = useState(null);
    const [parsing, setParsing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [parsedData, setParsedData] = useState([]);
    const [duplicates, setDuplicates] = useState([]);
    const [result, setResult] = useState(null);
    const fileInputRef = useRef(null);

    const resetState = () => {
        setFile(null);
        setParsedData([]);
        setDuplicates([]);
        setResult(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleClose = () => {
        setIsOpen(false);
        resetState();
    };

    // Parse CSV file
    const parseCSV = (text) => {
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) return [];

        // Get headers from first line
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));

        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = [];
            let current = '';
            let inQuotes = false;

            for (const char of lines[i]) {
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    values.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            values.push(current.trim());

            if (values.length >= headers.length) {
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index]?.replace(/"/g, '') || '';
                });
                data.push(row);
            }
        }
        return data;
    };

    // Detect duplicates within the uploaded file
    const detectDuplicates = (data) => {
        if (!duplicateKey) return { unique: data, duplicates: [] };

        const seen = new Set();
        const unique = [];
        const dups = [];

        data.forEach((row, index) => {
            const key = row[duplicateKey]?.toLowerCase();
            if (key && seen.has(key)) {
                dups.push({ ...row, _rowNumber: index + 2 }); // +2 for header and 1-based index
            } else {
                if (key) seen.add(key);
                unique.push(row);
            }
        });

        return { unique, duplicates: dups };
    };

    const handleFileChange = async (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;

        if (!selectedFile.name.endsWith('.csv')) {
            alert('Por favor selecciona un archivo .csv');
            return;
        }

        setFile(selectedFile);
        setParsing(true);
        setResult(null);

        try {
            const text = await selectedFile.text();
            const data = parseCSV(text);
            const { unique, duplicates: dups } = detectDuplicates(data);

            setParsedData(unique);
            setDuplicates(dups);
        } catch (err) {
            console.error('Error parsing CSV:', err);
            alert('Error al leer el archivo CSV');
        } finally {
            setParsing(false);
        }
    };

    const handleUpload = async () => {
        if (parsedData.length === 0) {
            alert('No hay datos para cargar');
            return;
        }

        setUploading(true);
        try {
            const uploadResult = await onUpload(parsedData);
            setResult({
                total: parsedData.length + duplicates.length,
                processed: parsedData.length,
                success: uploadResult.success || 0,
                errors: uploadResult.errors || [],
                duplicatesInFile: duplicates.length,
                duplicatesInDB: uploadResult.duplicates || 0
            });
        } catch (err) {
            console.error('Error uploading:', err);
            setResult({
                total: parsedData.length + duplicates.length,
                processed: parsedData.length,
                success: 0,
                errors: [{ message: err.message || 'Error desconocido' }],
                duplicatesInFile: duplicates.length,
                duplicatesInDB: 0
            });
        } finally {
            setUploading(false);
        }
    };

    const downloadTemplate = () => {
        const csv = [
            templateColumns.join(','),
            templateExample.join(',')
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plantilla_${entityName}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <>
            <button
                className="btn btn-secondary"
                onClick={() => setIsOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
                📤 Carga Masiva
            </button>

            {isOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.8)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem'
                }}>
                    <div style={{
                        background: '#0f1d3b',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '700px',
                        maxHeight: '90vh',
                        overflow: 'auto',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <h3 style={{ margin: 0 }}>📤 Carga Masiva de {entityName}</h3>
                            <button
                                className="btn btn-secondary"
                                onClick={handleClose}
                                style={{ padding: '6px 12px' }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '1.5rem' }}>
                            {/* Template download */}
                            <div style={{
                                background: 'rgba(59, 130, 246, 0.1)',
                                padding: '1rem',
                                borderRadius: '12px',
                                marginBottom: '1.5rem',
                                border: '1px solid rgba(59, 130, 246, 0.3)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                    <div>
                                        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>📋 Plantilla CSV</div>
                                        <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                                            Descarga la plantilla para ver el formato correcto
                                        </div>
                                    </div>
                                    <button
                                        className="btn btn-primary"
                                        onClick={downloadTemplate}
                                        style={{ padding: '8px 16px' }}
                                    >
                                        ⬇️ Descargar Plantilla
                                    </button>
                                </div>
                                <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#9ca3af' }}>
                                    <strong>Columnas requeridas:</strong> {templateColumns.join(', ')}
                                </div>
                            </div>

                            {/* File input */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                                    📁 Seleccionar archivo CSV
                                </label>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileChange}
                                    className="form-input"
                                    style={{ width: '100%' }}
                                />
                            </div>

                            {/* Parsing status */}
                            {parsing && (
                                <div style={{ textAlign: 'center', padding: '1rem', color: '#9ca3af' }}>
                                    ⏳ Analizando archivo...
                                </div>
                            )}

                            {/* Preview */}
                            {parsedData.length > 0 && !result && (
                                <div style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    marginBottom: '1rem'
                                }}>
                                    <h4 style={{ margin: '0 0 0.75rem' }}>📊 Vista Previa</h4>
                                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                        <div style={{
                                            background: 'rgba(16, 185, 129, 0.1)',
                                            padding: '0.75rem 1rem',
                                            borderRadius: '8px',
                                            border: '1px solid rgba(16, 185, 129, 0.3)'
                                        }}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>
                                                {parsedData.length}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Registros válidos</div>
                                        </div>
                                        {duplicates.length > 0 && (
                                            <div style={{
                                                background: 'rgba(245, 158, 11, 0.1)',
                                                padding: '0.75rem 1rem',
                                                borderRadius: '8px',
                                                border: '1px solid rgba(245, 158, 11, 0.3)'
                                            }}>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>
                                                    {duplicates.length}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Duplicados en archivo</div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Sample data */}
                                    <div style={{
                                        maxHeight: '150px',
                                        overflowY: 'auto',
                                        fontSize: '0.85rem',
                                        background: '#112250',
                                        borderRadius: '8px',
                                        padding: '0.5rem'
                                    }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr>
                                                    {templateColumns.map(col => (
                                                        <th key={col} style={{
                                                            padding: '4px 8px',
                                                            textAlign: 'left',
                                                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                                                            color: '#9ca3af',
                                                            fontSize: '0.75rem'
                                                        }}>
                                                            {col}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {parsedData.slice(0, 5).map((row, i) => (
                                                    <tr key={i}>
                                                        {templateColumns.map(col => (
                                                            <td key={col} style={{
                                                                padding: '4px 8px',
                                                                maxWidth: '150px',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                {row[col] || '-'}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {parsedData.length > 5 && (
                                            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                                ... y {parsedData.length - 5} más
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        className="btn btn-primary"
                                        onClick={handleUpload}
                                        disabled={uploading}
                                        style={{ width: '100%', marginTop: '1rem' }}
                                    >
                                        {uploading ? '⏳ Cargando...' : `📤 Cargar ${parsedData.length} registros`}
                                    </button>
                                </div>
                            )}

                            {/* Results */}
                            {result && (
                                <div style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    padding: '1rem',
                                    borderRadius: '12px'
                                }}>
                                    <h4 style={{ margin: '0 0 1rem' }}>📊 Resultado de la Carga</h4>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                                        <div style={{
                                            background: '#112250',
                                            padding: '0.75rem',
                                            borderRadius: '8px',
                                            textAlign: 'center'
                                        }}>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{result.total}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Total en archivo</div>
                                        </div>
                                        <div style={{
                                            background: 'rgba(16, 185, 129, 0.1)',
                                            padding: '0.75rem',
                                            borderRadius: '8px',
                                            textAlign: 'center',
                                            border: '1px solid rgba(16, 185, 129, 0.3)'
                                        }}>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#10b981' }}>{result.success}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Cargados OK</div>
                                        </div>
                                        <div style={{
                                            background: 'rgba(245, 158, 11, 0.1)',
                                            padding: '0.75rem',
                                            borderRadius: '8px',
                                            textAlign: 'center',
                                            border: '1px solid rgba(245, 158, 11, 0.3)'
                                        }}>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f59e0b' }}>
                                                {result.duplicatesInFile + result.duplicatesInDB}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Duplicados</div>
                                        </div>
                                        <div style={{
                                            background: 'rgba(239, 68, 68, 0.1)',
                                            padding: '0.75rem',
                                            borderRadius: '8px',
                                            textAlign: 'center',
                                            border: '1px solid rgba(239, 68, 68, 0.3)'
                                        }}>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#ef4444' }}>{result.errors.length}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Errores</div>
                                        </div>
                                    </div>

                                    {/* Success message */}
                                    {result.success > 0 && (
                                        <div style={{
                                            background: 'rgba(16, 185, 129, 0.15)',
                                            color: '#10b981',
                                            padding: '0.75rem',
                                            borderRadius: '8px',
                                            marginBottom: '0.75rem'
                                        }}>
                                            ✅ Se cargaron {result.success} {entityName} correctamente
                                        </div>
                                    )}

                                    {/* Errors list */}
                                    {result.errors.length > 0 && (
                                        <div style={{
                                            background: 'rgba(239, 68, 68, 0.1)',
                                            padding: '0.75rem',
                                            borderRadius: '8px',
                                            maxHeight: '120px',
                                            overflowY: 'auto'
                                        }}>
                                            <div style={{ fontWeight: 500, color: '#ef4444', marginBottom: '0.5rem' }}>
                                                ❌ Errores ({result.errors.length}):
                                            </div>
                                            {result.errors.slice(0, 10).map((err, i) => (
                                                <div key={i} style={{ fontSize: '0.8rem', color: '#fca5a5', marginBottom: '0.25rem' }}>
                                                    • {err.row ? `Fila ${err.row}: ` : ''}{err.message}
                                                </div>
                                            ))}
                                            {result.errors.length > 10 && (
                                                <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                                                    ... y {result.errors.length - 10} errores más
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={resetState}
                                            style={{ flex: 1 }}
                                        >
                                            🔄 Cargar Otro Archivo
                                        </button>
                                        <button
                                            className="btn btn-primary"
                                            onClick={handleClose}
                                            style={{ flex: 1 }}
                                        >
                                            ✓ Cerrar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default BulkUpload;
