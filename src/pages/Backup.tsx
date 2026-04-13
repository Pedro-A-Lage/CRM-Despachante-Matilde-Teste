import { useState, useRef } from 'react';
import { Download, Upload, AlertTriangle } from 'lucide-react';
import { exportAllData, importAllData } from '../lib/database';
import { useConfirm } from '../components/ConfirmProvider';

export default function Backup() {
    const [importStatus, setImportStatus] = useState<string>('');
    const confirm = useConfirm();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = async () => {
        try {
            const data = await exportAllData();
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `despachante-matilde-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch {
            setImportStatus('Erro ao exportar dados.');
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const ok = await confirm({
            title: 'Restaurar Dados',
            message: 'ATENÇÃO: Isso vai substituir TODOS os dados atuais. Deseja continuar?',
            confirmText: 'Restaurar',
            cancelText: 'Cancelar',
            danger: true,
        });
        if (!ok) {
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = event.target?.result as string;
                await importAllData(json);
                setImportStatus('Dados restaurados com sucesso! Recarregue a página.');
            } catch (err: any) {
                setImportStatus(`Erro ao importar: ${err.message || 'Verifique o arquivo.'}`);
            }
        };
        reader.readAsText(file);
    };

    return (
        <div>
            <div className="page-header">
                <h2>Backup / Restaurar</h2>
            </div>

            {/* Export */}
            <div className="card mb-6">
                <h3 className="card-title mb-4">
                    <Download size={20} style={{ display: 'inline', marginRight: 8 }} />
                    Exportar Dados
                </h3>
                <p className="text-sm text-gray mb-4">
                    Faça o download de todos os dados do sistema em formato JSON.
                    Salve este arquivo como backup de segurança.
                </p>
                <button className="btn btn-primary btn-lg" onClick={handleExport}>
                    <Download size={16} /> Baixar Backup
                </button>
            </div>

            {/* Import */}
            <div className="card">
                <h3 className="card-title mb-4">
                    <Upload size={20} style={{ display: 'inline', marginRight: 8 }} />
                    Restaurar Dados
                </h3>
                <div
                    className="alert-warning"
                    style={{
                        padding: 'var(--space-4)',
                        marginBottom: 'var(--space-4)',
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                    }}
                >
                    <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                    <p className="text-sm" style={{ margin: 0 }}>
                        <strong>Atenção:</strong> A restauração vai substituir TODOS os dados atuais.
                    </p>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImport}
                    className="form-input"
                    style={{ maxWidth: 400 }}
                />
                {importStatus && (
                    <p className="text-sm mt-4" style={{ fontWeight: 600 }}>
                        {importStatus}
                    </p>
                )}
            </div>
        </div>
    );
}
