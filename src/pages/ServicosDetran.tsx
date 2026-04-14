import { useState } from 'react';
import { ExternalLink, FileBadge, FileText, XCircle, Settings, Wrench, Upload, PlusCircle } from 'lucide-react';
import type { TipoServico } from '../types';
import { useNovaOSModal } from '../hooks/useNovaOSModal';

interface DetranService {
    id: TipoServico;
    title: string;
    description: string;
    url: string;
    icon: React.ElementType;
    color: string;
    bgColor: string;
}

// Serviços na ordem definida
const SERVICES: DetranService[] = [
    {
        id: 'transferencia',
        title: 'Transferência de Veículo',
        description: 'Acesse o portal para executar a transferência de propriedade do veículo.',
        url: 'https://transito.mg.gov.br/veiculos/transferencias/taxa-para-transferir-propriedade-de-veiculo-comprador/index/2',
        icon: Upload,
        color: '#0075de',
        bgColor: 'rgba(0,117,222,0.08)'
    },
    {
        id: 'primeiro_emplacamento',
        title: 'Primeiro Emplacamento',
        description: 'Registro e emplacamento de veículo zero km.',
        url: 'https://transito.mg.gov.br/veiculos/emplacamento/primeiro-emplacamento-veiculo-zero-km/complementar-dados-do-veiculo',
        icon: FileBadge,
        color: '#7c3aed',
        bgColor: 'rgba(124,58,237,0.08)'
    },
    {
        id: 'segunda_via',
        title: '2ª Via de Recibo (CRV)',
        description: 'Acesse o portal para solicitar a 2ª via do CRV.',
        url: 'https://transito.mg.gov.br/veiculos/documentos-de-veiculos/emitir-a-2-via-do-crv',
        icon: FileText,
        color: '#059669',
        bgColor: 'rgba(5,150,105,0.08)'
    },
    {
        id: 'alteracao_dados',
        title: 'Alteração de Dados',
        description: 'Inclusão ou retirada de restrição financeira. Altera gravame e dados do veículo.',
        url: 'https://transito.mg.gov.br/veiculos/alteracoes/solicitar-inclusao-ou-retirada-de-restricao-financeira-1',
        icon: Settings,
        color: '#dc2626',
        bgColor: 'rgba(220,38,38,0.08)'
    },
    {
        id: 'mudanca_caracteristica',
        title: 'Alteração de Características',
        description: 'Mudança de características do veículo como cor, combustível, carroceria, etc.',
        url: 'https://transito.mg.gov.br/veiculos/alteracoes/solicitar-alteracao-de-caracteristica-de-veiculo',
        icon: Wrench,
        color: '#db2777',
        bgColor: 'rgba(219,39,119,0.08)'
    },
    {
        id: 'baixa',
        title: 'Baixa de Veículo',
        description: 'Baixa definitiva de veículo por sinistro ou sucata.',
        url: 'https://transito.mg.gov.br/veiculos/veiculo-sinistrado-e-baixa-de-veiculo/taxa-de-baixa-de-veiculo',
        icon: XCircle,
        color: '#9333ea',
        bgColor: 'rgba(147,51,234,0.08)'
    },
];

export default function ServicosDetran() {
    const [hoveredService, setHoveredService] = useState<string | null>(null);
    const { open: openNovaOS } = useNovaOSModal();

    const openDetran = (service: DetranService) => {
        // Extensão desvinculada: apenas abrir o portal em nova aba.
        // Nada é capturado automaticamente e nenhuma OS é criada pelo PDF.
        // A OS deve ser criada manualmente pelo botão "Nova Ordem de Serviço".
        window.open(service.url, '_blank');
    };

    return (
        <div style={{ paddingBottom: 'var(--space-8)' }}>
            {/* Header */}
            <div style={{ marginBottom: 'var(--space-8)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: 'var(--notion-text)', letterSpacing: '-0.5px' }}>
                        Central de Serviços Detran MG
                    </h1>
                    <p style={{ margin: '8px 0 0', color: 'var(--notion-text-secondary)', fontSize: '0.95rem' }}>
                        Acesso direto aos portais do Governo do Estado de Minas Gerais.
                    </p>
                </div>
                <button
                    onClick={() => openNovaOS({})}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 20px',
                        background: 'var(--color-primary)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 10,
                        fontFamily: 'inherit',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                    }}
                >
                    <PlusCircle size={18} /> Nova Ordem de Serviço
                </button>
            </div>

            {/* Services Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
                gap: '18px'
            }}>
                {SERVICES.map((servico) => (
                    <div
                        key={servico.id}
                        onMouseEnter={() => setHoveredService(servico.id)}
                        onMouseLeave={() => setHoveredService(null)}
                        style={{
                            background: 'var(--notion-surface)',
                            border: hoveredService === servico.id ? `2px solid ${servico.color}` : `1px solid var(--notion-border)`,
                            borderRadius: 16,
                            padding: '24px',
                            display: 'flex',
                            flexDirection: 'column',
                            height: '100%',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            transform: hoveredService === servico.id ? 'translateY(-8px)' : 'translateY(0)',
                            boxShadow: hoveredService === servico.id ? `0 16px 32px ${servico.bgColor}` : '0 2px 8px rgba(0,0,0,0.08)',
                            position: 'relative',
                            overflow: 'hidden',
                            cursor: 'pointer',
                        }}
                        onClick={() => openDetran(servico)}
                    >
                        {/* Background accent */}
                        <div style={{
                            position: 'absolute',
                            top: -30,
                            right: -30,
                            width: 120,
                            height: 120,
                            borderRadius: '50%',
                            background: servico.color,
                            opacity: 0.05,
                        }} />

                        {/* Icon */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '14px',
                            marginBottom: '16px',
                            position: 'relative',
                            zIndex: 1,
                        }}>
                            <div style={{
                                width: 48,
                                height: 48,
                                borderRadius: 12,
                                background: servico.bgColor,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: `2px solid ${servico.color}33`,
                            }}>
                                <servico.icon size={24} style={{ color: servico.color, fontWeight: 700 }} />
                            </div>
                            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--notion-text)' }}>
                                {servico.title}
                            </h4>
                        </div>

                        {/* Description */}
                        <p style={{
                            color: 'var(--notion-text-secondary)',
                            fontSize: '0.9rem',
                            marginBottom: '20px',
                            lineHeight: 1.6,
                            flex: 1,
                            position: 'relative',
                            zIndex: 1,
                        }}>
                            {servico.description}
                        </p>

                        {/* Button */}
                        <button
                            style={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '11px 16px',
                                background: hoveredService === servico.id
                                    ? servico.color
                                    : servico.bgColor,
                                color: hoveredService === servico.id ? '#ffffff' : servico.color,
                                border: 'none',
                                borderRadius: 10,
                                fontFamily: 'inherit',
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                position: 'relative',
                                zIndex: 1,
                            }}
                            onClick={(e) => { e.stopPropagation(); openDetran(servico); }}
                        >
                            Acessar <ExternalLink size={16} />
                        </button>
                    </div>
                ))}
            </div>

        </div>
    );
}
