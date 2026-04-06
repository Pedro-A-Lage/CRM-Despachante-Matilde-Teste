import { useState } from 'react';
import { ExternalLink, FileBadge, FileText, XCircle, Settings, Wrench, Upload } from 'lucide-react';
import type { TipoServico } from '../types';

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
        description: 'Acesse o portal, execute a transferência e o CRM criará a OS automaticamente com o PDF capturado.',
        url: 'https://transito.mg.gov.br/veiculos/transferencias/taxa-para-transferir-propriedade-de-veiculo-comprador/index/2',
        icon: Upload,
        color: 'var(--color-info)',
        bgColor: 'var(--color-info-bg)'
    },
    {
        id: 'primeiro_emplacamento',
        title: 'Primeiro Emplacamento',
        description: 'Registro e emplacamento de veículo zero km.',
        url: 'https://transito.mg.gov.br/veiculos/emplacamento/primeiro-emplacamento-veiculo-zero-km/complementar-dados-do-veiculo',
        icon: FileBadge,
        color: 'var(--color-purple)',
        bgColor: 'var(--color-purple-bg)'
    },
    {
        id: 'segunda_via',
        title: '2ª Via de Recibo (CRV)',
        description: 'Acesse o portal, solicite a 2ª via e o CRM criará a OS automaticamente com o PDF capturado.',
        url: 'https://transito.mg.gov.br/veiculos/documentos-de-veiculos/emitir-a-2-via-do-crv',
        icon: FileText,
        color: 'var(--color-cyan)',
        bgColor: 'var(--color-cyan-bg)'
    },
    {
        id: 'alteracao_dados',
        title: 'Alteração de Dados',
        description: 'Inclusão ou retirada de restrição financeira. Altera gravame e dados do veículo.',
        url: 'https://transito.mg.gov.br/veiculos/alteracoes/solicitar-inclusao-ou-retirada-de-restricao-financeira-1',
        icon: Settings,
        color: 'var(--color-warning)',
        bgColor: 'var(--color-warning-bg)'
    },
    {
        id: 'mudanca_caracteristica',
        title: 'Alteração de Características',
        description: 'Mudança de características do veículo como cor, combustível, carroceria, etc.',
        url: 'https://transito.mg.gov.br/veiculos/alteracoes/solicitar-alteracao-de-caracteristica-de-veiculo',
        icon: Wrench,
        color: 'var(--color-pink)',
        bgColor: 'color-mix(in srgb, var(--color-pink) 12%, transparent)'
    },
    {
        id: 'baixa',
        title: 'Baixa de Veículo',
        description: 'Baixa definitiva de veículo por sinistro ou sucata.',
        url: 'https://transito.mg.gov.br/veiculos/veiculo-sinistrado-e-baixa-de-veiculo/taxa-de-baixa-de-veiculo',
        icon: XCircle,
        color: 'var(--color-danger)',
        bgColor: 'var(--color-danger-bg)'
    },
];

export default function ServicosDetran() {
    const [hoveredService, setHoveredService] = useState<string | null>(null);

    const openDetran = (service: DetranService) => {
        // Notifica a extensão qual serviço está sendo iniciado, depois abre o Detran.
        // A extensão captura o PDF ao final → IA analisa → CRM cria a OS automaticamente.
        window.postMessage({
            source: 'MATILDE_CRM_PAGE',
            action: 'DEFINIR_SERVICO',
            servico: service.id,
        }, '*');
        window.open(service.url, '_blank');
    };

    return (
        <div style={{ paddingBottom: 'var(--space-8)' }}>
            {/* Header */}
            <div style={{ marginBottom: 'var(--space-8)' }}>
                <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.5px' }}>
                    Central de Serviços Detran MG
                </h1>
                <p style={{ margin: '8px 0 0', color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
                    Acesso direto aos portais do Governo do Estado de Minas Gerais.
                </p>
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
                            background: 'var(--bg-card)',
                            border: hoveredService === servico.id ? `2px solid ${servico.color}` : `1px solid var(--border-color)`,
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
                            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                {servico.title}
                            </h4>
                        </div>

                        {/* Description */}
                        <p style={{
                            color: 'var(--color-text-secondary)',
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
                                    ? `linear-gradient(135deg, ${servico.color}, ${servico.color}cc)`
                                    : servico.bgColor,
                                color: hoveredService === servico.id ? 'var(--color-white)' : servico.color,
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
