import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, User, Car, Filter, X } from 'lucide-react';
import { getOrdens, getClientes, getVeiculos } from '../lib/database';
import {
    STATUS_OS_LABELS,
    STATUS_VISTORIA_LABELS,
} from '../types';
import { useServiceLabels, getServicoLabel } from '../hooks/useServiceLabels';
import type { StatusOS, TipoServico, OrdemDeServico } from '../types';

function getStatusBadge(status: string) {
    const map: Record<string, string> = {
        aguardando_documentacao: 'badge-warning',
        vistoria: 'badge-info',
        delegacia: 'badge-primary',
        doc_pronto: 'badge-success',
        entregue: 'badge-neutral',
    };
    return map[status] || 'badge-neutral';
}

function getVistoriaBadge(status: string) {
    const map: Record<string, string> = {
        agendar: 'badge-neutral',
        agendada: 'badge-info',
        reprovada: 'badge-danger',
        aprovada_apontamento: 'badge-warning',
        aprovada: 'badge-success',
    };
    return map[status] || 'badge-neutral';
}

function getChecklistProgress(os: OrdemDeServico) {
    if (os.checklist.length === 0) return '—';
    const recebidos = os.checklist.filter((i) => i.status === 'recebido').length;
    return `${recebidos}/${os.checklist.length}`;
}

function getEtapaAtual(os: OrdemDeServico): string {
    const checklistOk = os.checklist.every((i) => i.status === 'recebido');
    const vistoriaOk = os.vistoria?.status === 'aprovada' || os.vistoria?.status === 'aprovada_apontamento';
    const delegaciaOk = os.delegacia && os.delegacia.entradas.length > 0;

    if (os.status === 'doc_pronto' || os.status === 'entregue') return '✅ Concluído';
    if (delegaciaOk) return '🏛️ Na Delegacia';
    if (vistoriaOk) return '✅ Vistoria OK';
    if (os.vistoria?.status === 'agendada') return '📅 Vistoria Agendada';
    if (os.vistoria?.status === 'reprovada') return '❌ Vistoria Reprovada';
    if (checklistOk) return '📄 Checklist OK';
    return '📝 Checklist Pendente';
}

export default function ConsultaProcessos() {
    const navigate = useNavigate();
    const serviceLabels = useServiceLabels();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusOS | ''>('');
    const [tipoFilter, setTipoFilter] = useState<TipoServico | ''>('');
    const [showFilters, setShowFilters] = useState(false);

    const [ordens, setOrdens] = useState<OrdemDeServico[]>([]);
    const [clientes, setClientes] = useState<any[]>([]);
    const [veiculos, setVeiculos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([getOrdens(), getClientes(), getVeiculos()]).then(([o, c, v]) => {
            setOrdens(o);
            setClientes(c);
            setVeiculos(v);
            setLoading(false);
        });
    }, []);

    const results = useMemo(() => {
        let filtered = [...ordens];

        // Status filter
        if (statusFilter) {
            filtered = filtered.filter((o) => o.status === statusFilter);
        }

        // Tipo filter
        if (tipoFilter) {
            filtered = filtered.filter((o) => o.tipoServico === tipoFilter);
        }

        // Search
        if (search.trim()) {
            const terms = search.toLowerCase().split(/\s+/);
            filtered = filtered.filter((os) => {
                const cliente = clientes.find((c) => c.id === os.clienteId);
                const veiculo = veiculos.find((v) => v.id === os.veiculoId);

                const searchable = [
                    os.numero.toString(),
                    cliente?.nome || '',
                    cliente?.cpfCnpj || '',
                    veiculo?.placa || '',
                    veiculo?.chassi || '',
                    veiculo?.renavam || '',
                    veiculo?.marcaModelo || '',
                    getServicoLabel(serviceLabels, os.tipoServico),
                    STATUS_OS_LABELS[os.status],
                ]
                    .join(' ')
                    .toLowerCase();

                return terms.every((term) => searchable.includes(term));
            });
        }

        return filtered.sort(
            (a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime()
        );
    }, [ordens, clientes, veiculos, search, statusFilter, tipoFilter]);

    const clearFilters = () => {
        setSearch('');
        setStatusFilter('');
        setTipoFilter('');
    };

    const hasFilters = search || statusFilter || tipoFilter;

    return (
        <div>
            {loading && (
                <div className="card mb-6" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                    <p style={{ color: 'var(--notion-text-muted)', fontSize: 'var(--font-size-lg)' }}>Carregando dados...</p>
                </div>
            )}
            <div className={`page-header ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                <div>
                    <h2>Consulta de Processos</h2>
                    <p className="page-header-subtitle">
                        Busque por nome, CPF/CNPJ, placa, chassi, Renavam ou nº da OS
                    </p>
                </div>
            </div>

            {/* Search Bar */}
            <div className={`card mb-6 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div className="search-bar" style={{ flex: 1, maxWidth: 'none' }}>
                        <Search />
                        <input
                            type="text"
                            placeholder="Digite nome, CPF/CNPJ, placa, chassi, Renavam ou nº OS..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ fontSize: 'var(--font-size-md)', padding: 'var(--space-3) var(--space-4) var(--space-3) 44px' }}
                            autoFocus
                        />
                    </div>
                    <button
                        className={`btn ${showFilters ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        <Filter size={16} /> Filtros
                    </button>
                    {hasFilters && (
                        <button className="btn btn-ghost" onClick={clearFilters} title="Limpar filtros">
                            <X size={16} /> Limpar
                        </button>
                    )}
                </div>

                {/* Filters */}
                {showFilters && (
                    <div className="form-row mt-4">
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Status</label>
                            <select
                                className="form-select"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as StatusOS | '')}
                            >
                                <option value="">Todos</option>
                                {Object.entries(STATUS_OS_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Tipo de Serviço</label>
                            <select
                                className="form-select"
                                value={tipoFilter}
                                onChange={(e) => setTipoFilter(e.target.value as TipoServico | '')}
                            >
                                <option value="">Todos</option>
                                {Object.entries(serviceLabels).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Results count */}
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-gray">
                    {results.length} resultado{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
                    {hasFilters && ' (filtrado)'}
                </p>
            </div>

            {/* Results */}
            {results.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <Search />
                        <h3>{hasFilters ? 'Nenhum processo encontrado' : 'Faça uma busca'}</h3>
                        <p>
                            {hasFilters
                                ? 'Tente termos diferentes ou limpe os filtros.'
                                : 'Use o campo acima para buscar processos por qualquer dado.'}
                        </p>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {results.map((os) => {
                        const cliente = clientes.find((c) => c.id === os.clienteId);
                        const veiculo = veiculos.find((v) => v.id === os.veiculoId);

                        return (
                            <div
                                key={os.id}
                                className="card clickable"
                                onClick={() => navigate(`/ordens/${os.id}`)}
                                style={{
                                    padding: 'var(--space-4) var(--space-5)',
                                    cursor: 'pointer',
                                    transition: 'all var(--transition-fast)',
                                }}
                                onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--notion-blue)';
                                    (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--notion-border)';
                                    (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
                                }}
                            >
                                <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-2 mb-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span style={{
                                            background: 'var(--notion-blue)',
                                            color: 'white',
                                            fontWeight: 800,
                                            fontSize: 'var(--font-size-sm)',
                                            padding: '2px 10px',
                                            borderRadius: 'var(--radius-sm)',
                                        }}>
                                            OS #{os.numero}
                                        </span>
                                        <span className={`badge ${getStatusBadge(os.status)}`}>
                                            {STATUS_OS_LABELS[os.status]}
                                        </span>
                                        <span className="text-sm">{getEtapaAtual(os)}</span>
                                    </div>
                                    <span className="text-xs text-gray">
                                        {new Date(os.dataAbertura).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                    </span>
                                </div>

                                {/* Main Info */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                    gap: 'var(--space-4)',
                                }}>
                                    {/* Cliente */}
                                    <div className="flex items-center gap-2">
                                        <User size={14} style={{ color: 'var(--notion-text-muted)', flexShrink: 0 }} />
                                        <div>
                                            <p className="font-semibold text-sm" style={{ lineHeight: 1.3 }}>
                                                {cliente?.nome || '—'}
                                            </p>
                                            <p className="text-xs text-gray">{cliente?.cpfCnpj}</p>
                                        </div>
                                    </div>

                                    {/* Veículo */}
                                    <div className="flex items-center gap-2">
                                        <Car size={14} style={{ color: 'var(--notion-text-muted)', flexShrink: 0 }} />
                                        <div>
                                            <p className="font-semibold text-sm" style={{ lineHeight: 1.3 }}>
                                                {veiculo?.placa || 'Sem placa'} {veiculo?.marcaModelo ? `— ${veiculo.marcaModelo}` : ''}
                                            </p>
                                            <p className="text-xs text-gray">
                                                Chassi: {veiculo?.chassi?.slice(-8) || '—'}
                                                {veiculo?.renavam && ` | Renavam: ${veiculo.renavam}`}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Serviço + Progresso */}
                                    <div className="flex items-center gap-2">
                                        <FileText size={14} style={{ color: 'var(--notion-text-muted)', flexShrink: 0 }} />
                                        <div>
                                            <p className="font-semibold text-sm" style={{ lineHeight: 1.3 }}>
                                                {getServicoLabel(serviceLabels, os.tipoServico)}
                                            </p>
                                            <p className="text-xs text-gray">
                                                Docs: {getChecklistProgress(os)}
                                                {os.trocaPlaca && ' | Troca placa'}
                                                {os.vistoria && ` | Vistoria: ${STATUS_VISTORIA_LABELS[os.vistoria.status]}`}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
