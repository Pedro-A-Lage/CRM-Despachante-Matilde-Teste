import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2, Car, Gauge, Grid3x3, List } from 'lucide-react';
import { getVeiculos, getClientes, deleteVeiculo } from '../lib/database';
import type { Veiculo, Cliente } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';

export default function VeiculosList() {
    const [search, setSearch] = useState('');
    const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredCard, setHoveredCard] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    const loadData = async () => {
        setLoading(true);
        const [v, c] = await Promise.all([getVeiculos(), getClientes()]);
        setVeiculos(v);
        setClientes(c);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const filtered = useMemo(() => {
        let result = veiculos;
        if (search.trim()) {
            const term = search.toLowerCase();
            result = veiculos.filter(
                (v) =>
                    v.placa?.toLowerCase().includes(term) ||
                    v.renavam?.includes(term) ||
                    v.chassi?.toLowerCase().includes(term) ||
                    v.marcaModelo?.toLowerCase().includes(term)
            );
        }

        if (sortConfig) {
            result = [...result].sort((a, b) => {
                const modifier = sortConfig.direction === 'asc' ? 1 : -1;
                switch (sortConfig.key) {
                    case 'veiculo': {
                        const vA = a.placa || '';
                        const vB = b.placa || '';
                        return vA.localeCompare(vB) * modifier;
                    }
                    case 'renavam': {
                        const rA = a.renavam || '';
                        const rB = b.renavam || '';
                        return rA.localeCompare(rB) * modifier;
                    }
                    case 'chassi': {
                        const cA = a.chassi || '';
                        const cB = b.chassi || '';
                        return cA.localeCompare(cB) * modifier;
                    }
                    case 'cliente': {
                        const cA = getClienteNome(a.clienteId);
                        const cB = getClienteNome(b.clienteId);
                        return cA.localeCompare(cB) * modifier;
                    }
                    default: return 0;
                }
            });
        }
        
        return result;
    }, [veiculos, search, sortConfig, clientes]);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        } else if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            setSortConfig(null);
            return;
        }
        setSortConfig({ key, direction });
    };

    const SortableHeader = ({ label, sortKey, width }: { label: string, sortKey: string, width?: number }) => (
        <th 
            style={{ 
                padding: '14px 16px', textAlign: 'left', fontSize: '0.8rem', fontWeight: 700, 
                color: 'var(--notion-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', 
                borderBottom: '1px solid var(--notion-border)', background: 'var(--bg-body)', whiteSpace: 'nowrap', width,
                cursor: 'pointer', userSelect: 'none'
            }}
            onClick={() => handleSort(sortKey)}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {label}
                {sortConfig?.key === sortKey && sortConfig.direction === 'asc' && <span style={{ fontSize: 10 }}>▲</span>}
                {sortConfig?.key === sortKey && sortConfig.direction === 'desc' && <span style={{ fontSize: 10 }}>▼</span>}
                {sortConfig?.key !== sortKey && <span style={{ fontSize: 10, opacity: 0.3 }}>↕</span>}
            </div>
        </th>
    );

    const getClienteNome = (clienteId: string) =>
        clientes.find((c) => c.id === clienteId)?.nome || '—';

    const handleDelete = async (veiculo: Veiculo) => {
        if (confirm(`Deseja excluir o veículo "${veiculo.placa || veiculo.chassi}"?`)) {
            try {
                await deleteVeiculo(veiculo.id);
                loadData();
            } catch (err: any) {
                alert(err.message || 'Erro ao excluir veículo.');
            }
        }
    };

    if (loading) return <LoadingSpinner fullPage label="Carregando veículos..." />;

    return (
        <div>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-8)',
            }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: 'var(--notion-text)', letterSpacing: '-0.5px' }}>
                        Veículos
                    </h1>
                    <p style={{ margin: '8px 0 0', color: 'var(--notion-text-secondary)', fontSize: '0.95rem' }}>
                        {veiculos.length} veículo{veiculos.length !== 1 ? 's' : ''} cadastrado{veiculos.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <Link to="/veiculos/novo" style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '11px 20px',
                    background: 'linear-gradient(135deg, var(--notion-blue), var(--notion-blue))',
                    color: 'var(--notion-bg)',
                    borderRadius: 10,
                    textDecoration: 'none',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    boxShadow: '0 4px 12px rgba(255,193,7,0.3)',
                    transition: 'all 0.2s',
                }}
                    onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(255,193,7,0.4)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(255,193,7,0.3)';
                    }}
                >
                    <Plus size={18} /> Novo Veículo
                </Link>
            </div>

            {/* View Mode Toggle */}
            <div style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '16px',
            }}>
                <button
                    onClick={() => setViewMode('cards')}
                    style={{
                        padding: '8px 12px',
                        background: viewMode === 'cards' ? 'var(--notion-purple, #9065B0)' : 'var(--bg-body)',
                        color: viewMode === 'cards' ? '#fff' : 'var(--notion-text)',
                        border: viewMode === 'cards' ? 'none' : '1px solid var(--notion-border)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}
                    onMouseEnter={e => {
                        if (viewMode !== 'cards') {
                            e.currentTarget.style.borderColor = 'var(--notion-purple, #9065B0)';
                            e.currentTarget.style.background = 'rgba(139,92,246,0.08)';
                        }
                    }}
                    onMouseLeave={e => {
                        if (viewMode !== 'cards') {
                            e.currentTarget.style.borderColor = 'var(--notion-border)';
                            e.currentTarget.style.background = 'var(--bg-body)';
                        }
                    }}
                >
                    <Grid3x3 size={16} /> Cards
                </button>
                <button
                    onClick={() => setViewMode('list')}
                    style={{
                        padding: '8px 12px',
                        background: viewMode === 'list' ? 'var(--notion-purple, #9065B0)' : 'var(--bg-body)',
                        color: viewMode === 'list' ? '#fff' : 'var(--notion-text)',
                        border: viewMode === 'list' ? 'none' : '1px solid var(--notion-border)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}
                    onMouseEnter={e => {
                        if (viewMode !== 'list') {
                            e.currentTarget.style.borderColor = 'var(--notion-purple, #9065B0)';
                            e.currentTarget.style.background = 'rgba(139,92,246,0.08)';
                        }
                    }}
                    onMouseLeave={e => {
                        if (viewMode !== 'list') {
                            e.currentTarget.style.borderColor = 'var(--notion-border)';
                            e.currentTarget.style.background = 'var(--bg-body)';
                        }
                    }}
                >
                    <List size={16} /> Lista
                </button>
            </div>

            {/* Search */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                background: 'var(--notion-surface)',
                border: '1px solid var(--notion-border)',
                borderRadius: 12,
                marginBottom: 'var(--space-8)',
            }}>
                <Search size={18} style={{ color: 'var(--notion-text-secondary)' }} />
                <input
                    type="text"
                    placeholder="Buscar por placa, Renavam, chassi ou modelo..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--notion-text)',
                        fontSize: '0.95rem',
                        outline: 'none',
                    }}
                />
            </div>

            {/* Vehicle Cards Grid / List */}
            {viewMode === 'cards' ? (filtered.length === 0 ? (
                <div style={{
                    background: 'var(--notion-surface)',
                    border: '2px dashed var(--notion-border)',
                    borderRadius: 16,
                    padding: '60px 20px',
                    textAlign: 'center',
                }}>
                    <Car size={48} style={{ color: 'var(--notion-text-secondary)', opacity: 0.3, margin: '0 auto 16px' }} />
                    <h3 style={{ margin: '0 0 8px', color: 'var(--notion-text)', fontSize: '1.1rem', fontWeight: 700 }}>
                        {search ? 'Nenhum veículo encontrado' : 'Nenhum veículo cadastrado'}
                    </h3>
                    <p style={{ color: 'var(--notion-text-secondary)', fontSize: '0.9rem', margin: '0 0 20px' }}>
                        {search ? 'Tente uma busca diferente.' : 'Cadastre seu primeiro veículo para começar.'}
                    </p>
                    {!search && (
                        <Link to="/veiculos/novo" style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 20px',
                            background: 'linear-gradient(135deg, var(--notion-blue), var(--notion-blue))',
                            color: 'var(--notion-bg)',
                            borderRadius: 10,
                            textDecoration: 'none',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            boxShadow: '0 4px 12px rgba(255,193,7,0.3)',
                        }}>
                            <Plus size={18} /> Novo Veículo
                        </Link>
                    )}
                </div>
            ) : (
                <div className="veiculos-card-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '16px',
                }}>
                    {filtered.map((v) => (
                        <div
                            key={v.id}
                            onMouseEnter={() => setHoveredCard(v.id)}
                            onMouseLeave={() => setHoveredCard(null)}
                            style={{
                                background: 'var(--notion-surface)',
                                border: `2px solid ${hoveredCard === v.id ? 'var(--notion-purple, #9065B0)' : 'var(--notion-border)'}`,
                                borderRadius: 14,
                                padding: '20px',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                transform: hoveredCard === v.id ? 'translateY(-6px)' : 'translateY(0)',
                                boxShadow: hoveredCard === v.id ? '0 16px 32px rgba(139,92,246,0.15)' : '0 2px 8px rgba(0,0,0,0.08)',
                                position: 'relative',
                                overflow: 'hidden',
                            }}
                        >
                            {/* Background accent */}
                            <div style={{
                                position: 'absolute',
                                top: -30,
                                right: -30,
                                width: 100,
                                height: 100,
                                borderRadius: '50%',
                                background: 'var(--notion-purple, #9065B0)',
                                opacity: 0.04,
                            }} />

                            {/* Placa */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                marginBottom: '14px',
                                position: 'relative',
                                zIndex: 1,
                            }}>
                                <div style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 10,
                                    background: 'rgba(139,92,246,0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: '2px solid rgba(139,92,246,0.2)',
                                }}>
                                    <Car size={20} style={{ color: 'var(--notion-purple, #9065B0)' }} />
                                </div>
                                <div>
                                    <div style={{
                                        fontSize: '1.1rem',
                                        fontWeight: 800,
                                        color: 'var(--notion-text)',
                                        letterSpacing: '1px',
                                        fontFamily: 'monospace',
                                    }}>
                                        {v.placa || '—'}
                                    </div>
                                    <div style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--notion-text-muted)',
                                        marginTop: 2,
                                    }}>
                                        Placa
                                    </div>
                                </div>
                            </div>

                            {/* Marca/Modelo */}
                            <h3 style={{
                                margin: '0 0 12px',
                                fontSize: '0.95rem',
                                fontWeight: 700,
                                color: 'var(--notion-text)',
                                position: 'relative',
                                zIndex: 1,
                            }}>
                                {v.marcaModelo}
                            </h3>

                            {/* Info Grid */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '10px',
                                marginBottom: '12px',
                                position: 'relative',
                                zIndex: 1,
                            }}>
                                <div style={{
                                    padding: '8px',
                                    background: 'var(--bg-body)',
                                    border: '1px solid var(--notion-border)',
                                    borderRadius: 8,
                                }}>
                                    <div style={{
                                        fontSize: '0.7rem',
                                        color: 'var(--notion-text-muted)',
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                        marginBottom: 3,
                                    }}>Renavam</div>
                                    <div style={{
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        color: 'var(--notion-text)',
                                        fontFamily: 'monospace',
                                    }}>
                                        {v.renavam}
                                    </div>
                                </div>
                                <div style={{
                                    padding: '8px',
                                    background: 'var(--bg-body)',
                                    border: '1px solid var(--notion-border)',
                                    borderRadius: 8,
                                }}>
                                    <div style={{
                                        fontSize: '0.7rem',
                                        color: 'var(--notion-text-muted)',
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                        marginBottom: 3,
                                    }}>Chassi</div>
                                    <div style={{
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        color: 'var(--notion-text)',
                                        fontFamily: 'monospace',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {v.chassi}
                                    </div>
                                </div>
                            </div>

                            {/* Cliente */}
                            <Link to={`/clientes/${v.clienteId}`} style={{
                                display: 'block',
                                padding: '10px 12px',
                                background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(59,130,246,0.04))',
                                border: '1px solid rgba(59,130,246,0.1)',
                                borderRadius: 8,
                                marginBottom: '14px',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                color: 'var(--notion-blue)',
                                textDecoration: 'none',
                                transition: 'all 0.2s',
                                position: 'relative',
                                zIndex: 1,
                            }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.08))';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(59,130,246,0.04))';
                                }}
                            >
                                {getClienteNome(v.clienteId)}
                            </Link>

                            {/* Actions */}
                            <div style={{
                                display: 'flex',
                                gap: '8px',
                                position: 'relative',
                                zIndex: 1,
                            }}>
                                <Link to={`/veiculos/${v.id}/editar`} style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    padding: '8px 12px',
                                    background: 'rgba(245,158,11,0.12)',
                                    color: 'var(--notion-blue)',
                                    border: 'none',
                                    borderRadius: 8,
                                    textDecoration: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'var(--notion-blue)';
                                        e.currentTarget.style.color = 'var(--notion-bg)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'rgba(245,158,11,0.12)';
                                        e.currentTarget.style.color = 'var(--notion-blue)';
                                    }}
                                >
                                    <Pencil size={14} /> Editar
                                </Link>
                                <button
                                    style={{
                                        padding: '8px 12px',
                                        background: 'var(--notion-orange)',
                                        color: 'var(--notion-orange)',
                                        border: 'none',
                                        borderRadius: 8,
                                        fontWeight: 600,
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                    onClick={() => handleDelete(v)}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'var(--notion-orange)';
                                        e.currentTarget.style.color = 'var(--notion-text)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'var(--notion-orange)';
                                        e.currentTarget.style.color = 'var(--notion-orange)';
                                    }}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )) : (
                // LIST VIEW
                <div className="veiculos-list-grid" style={{
                    background: 'var(--notion-surface)',
                    border: '1px solid var(--notion-border)',
                    borderRadius: 12,
                    overflow: 'hidden',
                }}>
                    <div className="table-container" style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <SortableHeader label="Veículo" sortKey="veiculo" />
                                    <SortableHeader label="Renavam" sortKey="renavam" />
                                    <SortableHeader label="Chassi" sortKey="chassi" />
                                    <SortableHeader label="Cliente" sortKey="cliente" />
                                    <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: '0.8rem', fontWeight: 700, color: 'var(--notion-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--notion-border)', background: 'var(--bg-body)', whiteSpace: 'nowrap', width: 90 }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((v) => (
                                    <tr
                                        key={v.id}
                                        style={{ transition: 'background 0.2s', cursor: 'default' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.05)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--notion-border)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                                                    background: 'rgba(139,92,246,0.1)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    border: '2px solid rgba(139,92,246,0.2)',
                                                }}>
                                                    <Car size={16} style={{ color: 'var(--notion-purple, #9065B0)' }} />
                                                </div>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontWeight: 700, color: 'var(--notion-text)', fontFamily: 'monospace', letterSpacing: '1px', fontSize: '0.9rem' }}>
                                                        {v.placa || '—'}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--notion-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
                                                        {v.marcaModelo}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--notion-border)', fontFamily: 'monospace', color: 'var(--notion-text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                            {v.renavam}
                                        </td>
                                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--notion-border)', fontFamily: 'monospace', color: 'var(--notion-text-secondary)', fontSize: '0.85rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {v.chassi}
                                        </td>
                                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--notion-border)' }}>
                                            <Link to={`/clientes/${v.clienteId}`} style={{
                                                color: 'var(--notion-blue)', textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem',
                                                transition: 'all 0.2s', whiteSpace: 'nowrap',
                                            }}
                                                onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
                                                onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                                            >
                                                {clientes.find(c => c.id === v.clienteId)?.nome || '—'}
                                            </Link>
                                        </td>
                                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--notion-border)' }}>
                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                <Link to={`/veiculos/${v.id}/editar`} style={{
                                                    padding: '6px 10px', background: 'rgba(245,158,11,0.12)', color: 'var(--notion-blue)',
                                                    borderRadius: 6, textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600,
                                                    cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center',
                                                }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-blue)'; e.currentTarget.style.color = 'var(--notion-bg)'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.12)'; e.currentTarget.style.color = 'var(--notion-blue)'; }}
                                                >
                                                    <Pencil size={14} />
                                                </Link>
                                                <button
                                                    onClick={() => handleDelete(v)}
                                                    style={{
                                                        padding: '6px 10px', background: 'var(--notion-orange)', color: 'var(--notion-orange)',
                                                        border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                                                        fontSize: '0.75rem', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-orange)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--notion-orange)'; e.currentTarget.style.color = 'var(--notion-orange)'; }}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
