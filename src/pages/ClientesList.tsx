import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Eye, Pencil, Trash2, User, MapPin, Phone, Calendar, Grid3x3, List } from 'lucide-react';
import { getClientes, deleteCliente } from '../lib/database';
import type { Cliente } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useConfirm } from '../components/ConfirmProvider';

function formatCpfCnpj(value: string): string {
    if (!value) return '—';
    const digits = value.replace(/\D/g, '');
    if (digits.length === 11) {
        return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    } else if (digits.length === 14) {
        return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
    }
    return value;
}

export default function ClientesList() {
    const confirm = useConfirm();
    const [search, setSearch] = useState('');
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredCard, setHoveredCard] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    const loadClientes = async () => {
        setLoading(true);
        const data = await getClientes();
        setClientes(data);
        setLoading(false);
    };

    useEffect(() => { loadClientes(); }, []);

    const filtered = useMemo(() => {
        let result = clientes;
        if (search.trim()) {
            const term = search.toLowerCase();
            result = clientes.filter(
                (c) =>
                    c.nome.toLowerCase().includes(term) ||
                    c.cpfCnpj.includes(term) ||
                    c.telefones.some((t) => t.includes(term))
            );
        }

        if (sortConfig) {
            result = [...result].sort((a, b) => {
                const modifier = sortConfig.direction === 'asc' ? 1 : -1;
                switch (sortConfig.key) {
                    case 'tipo': return a.tipo.localeCompare(b.tipo) * modifier;
                    case 'nome': return a.nome.localeCompare(b.nome) * modifier;
                    case 'documento': return a.cpfCnpj.localeCompare(b.cpfCnpj) * modifier;
                    case 'telefone': {
                        const tA = a.telefones[0] || '';
                        const tB = b.telefones[0] || '';
                        return tA.localeCompare(tB) * modifier;
                    }
                    default: return 0;
                }
            });
        }
        
        return result;
    }, [clientes, search, sortConfig]);

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
                borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-bg)', whiteSpace: 'nowrap', width,
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

    const handleDelete = async (cliente: Cliente) => {
        const ok = await confirm({
            title: 'Excluir Cliente',
            message: `Deseja excluir o cliente "${cliente.nome}"? Esta ação não pode ser desfeita.`,
            confirmText: 'Excluir',
            danger: true,
        });
        if (!ok) return;
        try {
            await deleteCliente(cliente.id);
            loadClientes();
        } catch (err: any) {
            alert(err.message || 'Erro ao excluir cliente.');
        }
    };

    if (loading) return <LoadingSpinner fullPage label="Carregando clientes..." />;

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
                        Clientes
                    </h1>
                    <p style={{ margin: '8px 0 0', color: 'var(--notion-text-secondary)', fontSize: '0.95rem' }}>
                        {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} cadastrado{clientes.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <Link to="/clientes/novo" style={{
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
                    <Plus size={18} /> Novo Cliente
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
                        background: viewMode === 'cards' ? 'var(--notion-purple, #9065B0)' : 'var(--notion-bg)',
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
                            e.currentTarget.style.background = 'var(--notion-bg)';
                        }
                    }}
                >
                    <Grid3x3 size={16} /> Cards
                </button>
                <button
                    onClick={() => setViewMode('list')}
                    style={{
                        padding: '8px 12px',
                        background: viewMode === 'list' ? 'var(--notion-purple, #9065B0)' : 'var(--notion-bg)',
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
                            e.currentTarget.style.background = 'var(--notion-bg)';
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
                    placeholder="Buscar por nome, CPF/CNPJ ou telefone..."
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

            {/* Client Cards Grid / List */}
            {viewMode === 'cards' ? (filtered.length === 0 ? (
                <div style={{
                    background: 'var(--notion-surface)',
                    border: '2px dashed var(--notion-border)',
                    borderRadius: 16,
                    padding: '60px 20px',
                    textAlign: 'center',
                }}>
                    <User size={48} style={{ color: 'var(--notion-text-secondary)', opacity: 0.3, margin: '0 auto 16px' }} />
                    <h3 style={{ margin: '0 0 8px', color: 'var(--notion-text)', fontSize: '1.1rem', fontWeight: 700 }}>
                        {search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
                    </h3>
                    <p style={{ color: 'var(--notion-text-secondary)', fontSize: '0.9rem', margin: '0 0 20px' }}>
                        {search ? 'Tente uma busca diferente.' : 'Cadastre seu primeiro cliente para começar.'}
                    </p>
                    {!search && (
                        <Link to="/clientes/novo" style={{
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
                            <Plus size={18} /> Novo Cliente
                        </Link>
                    )}
                </div>
            ) : (
                <div className="clientes-card-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '16px',
                }}>
                    {filtered.map((c) => (
                        <div
                            key={c.id}
                            onMouseEnter={() => setHoveredCard(c.id)}
                            onMouseLeave={() => setHoveredCard(null)}
                            style={{
                                background: 'var(--notion-surface)',
                                border: `2px solid ${hoveredCard === c.id ? 'var(--notion-blue)' : 'var(--notion-border)'}`,
                                borderRadius: 14,
                                padding: '20px',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                transform: hoveredCard === c.id ? 'translateY(-6px)' : 'translateY(0)',
                                boxShadow: hoveredCard === c.id ? '0 16px 32px rgba(255,193,7,0.15)' : '0 2px 8px rgba(0,0,0,0.08)',
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
                                background: 'var(--notion-blue)',
                                opacity: 0.04,
                            }} />

                            {/* Tipo Badge */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '14px',
                                position: 'relative',
                                zIndex: 1,
                            }}>
                                <span style={{
                                    padding: '4px 10px',
                                    borderRadius: 7,
                                    background: c.tipo === 'PF' ? 'rgba(55,114,255,0.1)' : 'rgba(139,92,246,0.1)',
                                    color: c.tipo === 'PF' ? 'var(--notion-blue)' : '#7c3aed',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.03em',
                                }}>
                                    {c.tipo === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                                </span>
                                <span style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--notion-text-secondary)',
                                    fontWeight: 500,
                                }}>
                                    {new Date(c.criadoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                </span>
                            </div>

                            {/* Name */}
                            <h3 style={{
                                margin: '0 0 12px',
                                fontSize: '1rem',
                                fontWeight: 700,
                                color: 'var(--notion-text)',
                                position: 'relative',
                                zIndex: 1,
                            }}>
                                {c.nome}
                            </h3>

                            {/* CPF/CNPJ */}
                            <div style={{
                                padding: '10px 12px',
                                background: 'var(--notion-bg)',
                                border: '1px solid var(--notion-border)',
                                borderRadius: 8,
                                marginBottom: '12px',
                                fontSize: '0.85rem',
                                color: 'var(--notion-text-secondary)',
                                fontFamily: 'monospace',
                                position: 'relative',
                                zIndex: 1,
                            }}>
                                {formatCpfCnpj(c.cpfCnpj)}
                            </div>

                            {/* Info */}
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                marginBottom: '16px',
                                position: 'relative',
                                zIndex: 1,
                            }}>
                                {c.telefones[0] && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--notion-text-secondary)' }}>
                                        <Phone size={14} style={{ opacity: 0.6 }} />
                                        <span>{c.telefones[0]}</span>
                                    </div>
                                )}
                                {(c as any).endereco && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--notion-text-secondary)' }}>
                                        <MapPin size={14} style={{ opacity: 0.6 }} />
                                        <span>{(c as any).endereco}</span>
                                    </div>
                                )}
                                {!c.telefones[0] && !(c as any).endereco && (
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--notion-text-secondary)', fontStyle: 'italic' }}>
                                        Sem informações adicionais
                                    </p>
                                )}
                            </div>

                            {/* Actions */}
                            <div style={{
                                display: 'flex',
                                gap: '8px',
                                position: 'relative',
                                zIndex: 1,
                            }}>
                                <Link to={`/clientes/${c.id}`} style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    padding: '8px 12px',
                                    background: 'rgba(55,114,255,0.1)',
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
                                        e.currentTarget.style.color = 'var(--notion-text)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'rgba(55,114,255,0.1)';
                                        e.currentTarget.style.color = 'var(--notion-blue)';
                                    }}
                                >
                                    <Eye size={14} /> Ver
                                </Link>
                                <Link to={`/clientes/${c.id}/editar`} style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    padding: '8px 12px',
                                    background: 'rgba(0,117,222,0.1)',
                                    color: 'var(--notion-blue)',
                                    border: '1px solid rgba(0,117,222,0.2)',
                                    borderRadius: 8,
                                    textDecoration: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'rgba(0,117,222,0.2)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'rgba(0,117,222,0.1)';
                                    }}
                                >
                                    <Pencil size={14} /> Editar
                                </Link>
                                <button
                                    style={{
                                        padding: '8px 12px',
                                        background: 'rgba(221,91,0,0.1)',
                                        color: 'var(--notion-orange)',
                                        border: '1px solid rgba(221,91,0,0.2)',
                                        borderRadius: 8,
                                        fontWeight: 600,
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                    onClick={() => handleDelete(c)}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'rgba(221,91,0,0.18)';
                                        e.currentTarget.style.color = 'var(--notion-orange)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'rgba(221,91,0,0.1)';
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
                <div className="clientes-list-grid" style={{
                    background: 'var(--notion-surface)',
                    border: '1px solid var(--notion-border)',
                    borderRadius: 12,
                    overflow: 'hidden',
                }}>
                    <div className="table-container" style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <SortableHeader label="Tipo" sortKey="tipo" width={80} />
                                    <SortableHeader label="Cliente" sortKey="nome" />
                                    <SortableHeader label="CPF/CNPJ" sortKey="documento" />
                                    <SortableHeader label="Telefone" sortKey="telefone" />
                                    <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: '0.8rem', fontWeight: 700, color: 'var(--notion-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-bg)', whiteSpace: 'nowrap', width: 120 }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--notion-text-secondary)', fontSize: 13 }}>
                                            <User size={32} style={{ opacity: 0.2, display: 'block', margin: '0 auto 10px' }} />
                                            {search ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente cadastrado.'}
                                        </td>
                                    </tr>
                                )}
                                {filtered.map((c) => (
                                    <tr
                                        key={c.id}
                                        style={{ transition: 'background 0.2s', cursor: 'default' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.05)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--notion-border)' }}>
                                            <span style={{
                                                padding: '4px 10px', borderRadius: 7,
                                                background: c.tipo === 'PF' ? 'rgba(55,114,255,0.1)' : 'rgba(139,92,246,0.1)',
                                                color: c.tipo === 'PF' ? 'var(--notion-blue)' : '#7c3aed',
                                                fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em',
                                            }}>
                                                {c.tipo === 'PF' ? 'PF' : 'PJ'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--notion-border)', fontWeight: 600, color: 'var(--notion-text)', fontSize: '0.9rem' }}>
                                            {c.nome}
                                        </td>
                                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--notion-border)', fontFamily: 'monospace', color: 'var(--notion-text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                            {formatCpfCnpj(c.cpfCnpj)}
                                        </td>
                                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--notion-border)', color: 'var(--notion-text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                            {c.telefones[0] || '—'}
                                        </td>
                                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--notion-border)' }}>
                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                <Link to={`/clientes/${c.id}`} style={{
                                                    padding: '6px 10px', background: 'rgba(55,114,255,0.1)', color: 'var(--notion-blue)',
                                                    borderRadius: 6, textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600,
                                                    cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center',
                                                }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-blue)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(55,114,255,0.1)'; e.currentTarget.style.color = 'var(--notion-blue)'; }}
                                                >
                                                    <Eye size={14} />
                                                </Link>
                                                <Link to={`/clientes/${c.id}/editar`} style={{
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
                                                    onClick={() => handleDelete(c)}
                                                    style={{
                                                        padding: '6px 10px', background: 'rgba(221,91,0,0.1)', color: 'var(--notion-orange)',
                                                        border: '1px solid rgba(221,91,0,0.2)', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                                                        fontSize: '0.75rem', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(221,91,0,0.18)'; e.currentTarget.style.color = 'var(--notion-orange)'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(221,91,0,0.1)'; e.currentTarget.style.color = 'var(--notion-orange)'; }}
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
