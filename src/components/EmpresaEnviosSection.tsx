// src/components/EmpresaEnviosSection.tsx
import React, { useState, useRef } from 'react';
import { Building2, Mail, Check, Plus, Trash2, Edit2, CheckCircle2, Circle, Upload, FileText, Image, X } from 'lucide-react';
import type { EtapaEnvioStatus, EtapaDocumento } from '../types/empresa';
import type { EmpresaParceira } from '../types/empresa';
import {
    marcarDocumentoPronto,
    marcarEtapaEnviada,
    etapaCompleta,
    adicionarDocumentoNaEtapa,
    removerDocumentoDaEtapa,
    adicionarEtapa,
    removerEtapa,
} from '../lib/empresaService';
import { uploadFileToSupabase } from '../lib/fileStorage';

interface Props {
    empresa: EmpresaParceira;
    enviosStatus: EtapaEnvioStatus[];
    osNumero: number;
    osId: string;
    placa: string;
    onUpdate: (envios: EtapaEnvioStatus[]) => void;
}

const DOC_LABELS: Record<string, string> = {
    tx_estado: 'Tx do Estado',
    comprovante_pagamento: 'Comprovante de Pagamento',
    taxa_vistoria: 'Taxa da Vistoria',
    boleto_placa: 'Boleto da Placa',
    comprovante_placa: 'Comprovante Placa',
    nota_fiscal: 'Nota Fiscal',
    dae: 'DAE',
    vistoria_paga: 'Vistoria Paga',
    doc_pronto: 'Documento Pronto',
};

function docLabel(tipo: string): string {
    return DOC_LABELS[tipo] || tipo.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function isImage(nome: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(nome);
}

export function EmpresaEnviosSection({ empresa, enviosStatus, osNumero, osId, placa, onUpdate }: Props) {
    const [editando, setEditando] = useState(false);
    const [novoDocTipo, setNovoDocTipo] = useState('');
    const [novaEtapaNome, setNovaEtapaNome] = useState('');
    const [uploading, setUploading] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [pendingUpload, setPendingUpload] = useState<{ etapaIdx: number; tipoDoc: string } | null>(null);

    const handleToggleDoc = (etapaIdx: number, tipoDoc: string, atual: boolean) => {
        onUpdate(marcarDocumentoPronto(enviosStatus, etapaIdx, tipoDoc, !atual));
    };

    const handleMarcarEnviada = (etapaIdx: number) => {
        onUpdate(marcarEtapaEnviada(enviosStatus, etapaIdx));
    };

    const handleGerarEmail = (etapa: EtapaEnvioStatus) => {
        const assunto = empresa.emailAssuntoTemplate
            ? empresa.emailAssuntoTemplate.replace('{numero}', String(osNumero)).replace('{placa}', placa)
            : `OS #${osNumero} - ${placa} - ${etapa.nome}`;

        const docsAnexados = etapa.documentos
            .filter((d) => d.pronto && d.arquivo_nome)
            .map((d) => `- ${docLabel(d.tipo)}: ${d.arquivo_nome}`)
            .join('\n');

        const corpo = empresa.emailCorpoTemplate
            || `Segue documentação referente à OS #${osNumero} (${placa}).\n\nEtapa: ${etapa.nome}\n\nDocumentos em anexo:\n${docsAnexados || etapa.documentos.map((d) => '- ' + docLabel(d.tipo)).join('\n')}`;

        const mailto = `mailto:${empresa.email || ''}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
        window.open(mailto, '_blank');
    };

    const handleFileUpload = async (etapaIdx: number, tipoDoc: string, file: File) => {
        const key = `${etapaIdx}-${tipoDoc}`;
        setUploading(key);
        try {
            const path = `empresas/${empresa.nome}/${osId}/${tipoDoc}_${file.name}`;
            const url = await uploadFileToSupabase(file, path);
            // Update the doc with file info and mark as pronto
            const updated = enviosStatus.map((etapa, i) => {
                if (i !== etapaIdx) return etapa;
                return {
                    ...etapa,
                    documentos: etapa.documentos.map((doc) => {
                        if (doc.tipo !== tipoDoc) return doc;
                        return { ...doc, pronto: true, arquivo_url: url, arquivo_nome: file.name };
                    }),
                };
            });
            onUpdate(updated);
        } catch (err) {
            console.error('Erro no upload:', err);
        } finally {
            setUploading(null);
        }
    };

    const triggerUpload = (etapaIdx: number, tipoDoc: string) => {
        setPendingUpload({ etapaIdx, tipoDoc });
        fileInputRef.current?.click();
    };

    const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && pendingUpload) {
            handleFileUpload(pendingUpload.etapaIdx, pendingUpload.tipoDoc, file);
        }
        e.target.value = '';
        setPendingUpload(null);
    };

    const handleRemoveFile = (etapaIdx: number, tipoDoc: string) => {
        const updated = enviosStatus.map((etapa, i) => {
            if (i !== etapaIdx) return etapa;
            return {
                ...etapa,
                documentos: etapa.documentos.map((doc) => {
                    if (doc.tipo !== tipoDoc) return doc;
                    return { ...doc, pronto: false, arquivo_url: null, arquivo_nome: null };
                }),
            };
        });
        onUpdate(updated);
    };

    const handleAddDoc = (etapaIdx: number) => {
        if (!novoDocTipo.trim()) return;
        onUpdate(adicionarDocumentoNaEtapa(enviosStatus, etapaIdx, novoDocTipo.trim().toLowerCase().replace(/\s+/g, '_')));
        setNovoDocTipo('');
    };

    const handleRemoveDoc = (etapaIdx: number, tipoDoc: string) => {
        onUpdate(removerDocumentoDaEtapa(enviosStatus, etapaIdx, tipoDoc));
    };

    const handleAddEtapa = () => {
        if (!novaEtapaNome.trim()) return;
        onUpdate(adicionarEtapa(enviosStatus, novaEtapaNome.trim(), []));
        setNovaEtapaNome('');
    };

    const handleRemoveEtapa = (etapaIdx: number) => {
        onUpdate(removerEtapa(enviosStatus, etapaIdx));
    };

    // Hidden file input
    const hiddenInput = (
        <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
        />
    );

    return (
        <div style={{
            background: 'var(--color-gray-900)',
            border: '1px solid var(--color-gray-700)',
            borderRadius: '12px',
            padding: '16px',
        }}>
            {hiddenInput}

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Building2 size={18} style={{ color: empresa.cor }} />
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                        Envios — <span style={{ color: empresa.cor }}>{empresa.nome}</span>
                    </h3>
                </div>
                <button
                    onClick={() => setEditando(!editando)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px',
                        color: editando ? '#d4a843' : 'var(--color-text-tertiary)',
                        background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px',
                    }}
                    className="hover:bg-white/5 transition-colors"
                >
                    <Edit2 size={12} />
                    {editando ? 'Concluir' : 'Editar'}
                </button>
            </div>

            {/* Etapas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {enviosStatus.map((etapa, etapaIdx) => {
                    const completa = etapaCompleta(etapa);
                    const enviado = etapa.enviado;

                    const borderColor = enviado ? 'rgba(40,160,106,0.3)' : completa ? 'rgba(212,168,67,0.3)' : 'var(--color-gray-700)';
                    const bgColor = enviado ? 'rgba(40,160,106,0.06)' : completa ? 'rgba(212,168,67,0.06)' : 'rgba(255,255,255,0.02)';

                    return (
                        <div key={etapaIdx} style={{ border: `1px solid ${borderColor}`, borderRadius: '10px', padding: '12px', background: bgColor }}>
                            {/* Etapa header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        fontSize: '10px', fontWeight: 700,
                                        color: enviado ? '#28A06A' : completa ? '#d4a843' : 'var(--color-text-tertiary)',
                                        background: enviado ? 'rgba(40,160,106,0.15)' : completa ? 'rgba(212,168,67,0.15)' : 'rgba(255,255,255,0.06)',
                                        borderRadius: '4px', padding: '2px 6px',
                                    }}>
                                        {etapa.etapa}
                                    </span>
                                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                        {etapa.nome}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {enviado && (
                                        <span style={{ fontSize: '10px', color: '#28A06A', fontWeight: 500 }}>
                                            Enviado {new Date(etapa.enviado_em!).toLocaleDateString('pt-BR')}
                                        </span>
                                    )}
                                    {editando && !enviado && (
                                        <button onClick={() => handleRemoveEtapa(etapaIdx)} style={{ color: '#C84040', opacity: 0.7, padding: '2px', background: 'none', border: 'none', cursor: 'pointer' }}>
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Documentos */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {etapa.documentos.map((doc) => {
                                    const isUploading = uploading === `${etapaIdx}-${doc.tipo}`;
                                    return (
                                        <div key={doc.tipo} className="group" style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            padding: '6px 8px', borderRadius: '6px',
                                            background: doc.arquivo_url ? 'rgba(40,160,106,0.06)' : 'rgba(255,255,255,0.02)',
                                            border: `1px solid ${doc.arquivo_url ? 'rgba(40,160,106,0.15)' : 'rgba(255,255,255,0.04)'}`,
                                        }}>
                                            {/* Status icon */}
                                            <button
                                                onClick={() => !enviado && handleToggleDoc(etapaIdx, doc.tipo, doc.pronto)}
                                                disabled={enviado}
                                                style={{ background: 'none', border: 'none', cursor: enviado ? 'default' : 'pointer', padding: 0, flexShrink: 0 }}
                                            >
                                                {doc.pronto ? (
                                                    <CheckCircle2 size={14} style={{ color: '#28A06A' }} />
                                                ) : (
                                                    <Circle size={14} style={{ color: 'var(--color-gray-600)' }} />
                                                )}
                                            </button>

                                            {/* Doc name */}
                                            <span style={{ fontSize: '12px', color: doc.pronto ? '#28A06A' : 'var(--color-text-secondary)', flex: 1 }}>
                                                {docLabel(doc.tipo)}
                                            </span>

                                            {/* File info or upload */}
                                            {doc.arquivo_url ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    {isImage(doc.arquivo_nome || '') ? <Image size={11} style={{ color: 'var(--color-text-tertiary)' }} /> : <FileText size={11} style={{ color: 'var(--color-text-tertiary)' }} />}
                                                    <a
                                                        href={doc.arquivo_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                        title={doc.arquivo_nome || ''}
                                                    >
                                                        {doc.arquivo_nome}
                                                    </a>
                                                    {!enviado && (
                                                        <button
                                                            onClick={() => handleRemoveFile(etapaIdx, doc.tipo)}
                                                            style={{ color: '#C84040', opacity: 0.5, background: 'none', border: 'none', cursor: 'pointer', padding: '1px' }}
                                                            className="hover:!opacity-100"
                                                            title="Remover arquivo"
                                                        >
                                                            <X size={11} />
                                                        </button>
                                                    )}
                                                </div>
                                            ) : !enviado ? (
                                                <button
                                                    onClick={() => triggerUpload(etapaIdx, doc.tipo)}
                                                    disabled={isUploading}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '3px',
                                                        fontSize: '10px', fontWeight: 500,
                                                        color: isUploading ? 'var(--color-text-tertiary)' : '#d4a843',
                                                        background: 'rgba(212,168,67,0.08)',
                                                        border: '1px solid rgba(212,168,67,0.2)',
                                                        borderRadius: '4px', padding: '2px 6px', cursor: 'pointer',
                                                    }}
                                                >
                                                    <Upload size={10} />
                                                    {isUploading ? 'Enviando...' : 'Anexar'}
                                                </button>
                                            ) : null}

                                            {/* Edit mode: remove doc */}
                                            {editando && !enviado && (
                                                <button
                                                    onClick={() => handleRemoveDoc(etapaIdx, doc.tipo)}
                                                    style={{ color: '#C84040', opacity: 0, padding: '2px', background: 'none', border: 'none', cursor: 'pointer' }}
                                                    className="group-hover:!opacity-70 hover:!opacity-100 transition-opacity"
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Add doc (edit mode) */}
                            {editando && !enviado && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', paddingLeft: '4px' }}>
                                    <input
                                        type="text"
                                        value={novoDocTipo}
                                        onChange={(e) => setNovoDocTipo(e.target.value)}
                                        placeholder="Novo documento..."
                                        style={{
                                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                            color: '#e2e8f0', fontSize: '11px', borderRadius: '6px', padding: '4px 8px',
                                            flex: 1, height: '26px', outline: 'none',
                                        }}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddDoc(etapaIdx)}
                                    />
                                    <button onClick={() => handleAddDoc(etapaIdx)} style={{ color: '#d4a843', padding: '2px', background: 'none', border: 'none', cursor: 'pointer' }}>
                                        <Plus size={14} />
                                    </button>
                                </div>
                            )}

                            {/* Action buttons */}
                            {!enviado && (
                                <div style={{ display: 'flex', gap: '6px', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    <button
                                        onClick={() => completa && handleGerarEmail(etapa)}
                                        disabled={!completa}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                            fontSize: '11px', fontWeight: 500,
                                            color: completa ? '#d4a843' : 'var(--color-text-tertiary)',
                                            background: completa ? 'rgba(212,168,67,0.12)' : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${completa ? 'rgba(212,168,67,0.25)' : 'rgba(255,255,255,0.06)'}`,
                                            borderRadius: '6px', padding: '5px 12px',
                                            cursor: completa ? 'pointer' : 'not-allowed', opacity: completa ? 1 : 0.5,
                                        }}
                                    >
                                        <Mail size={12} />
                                        Gerar Email
                                    </button>
                                    {completa && (
                                        <button
                                            onClick={() => handleMarcarEnviada(etapaIdx)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '4px',
                                                fontSize: '11px', fontWeight: 500, color: '#28A06A',
                                                background: 'rgba(40,160,106,0.12)', border: '1px solid rgba(40,160,106,0.25)',
                                                borderRadius: '6px', padding: '5px 12px', cursor: 'pointer',
                                            }}
                                        >
                                            <Check size={12} />
                                            Marcar enviado
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Add etapa (edit mode) */}
            {editando && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px',
                    paddingTop: '8px', borderTop: '1px solid var(--color-gray-700)',
                }}>
                    <input
                        type="text"
                        value={novaEtapaNome}
                        onChange={(e) => setNovaEtapaNome(e.target.value)}
                        placeholder="Nome da nova etapa..."
                        style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            color: '#e2e8f0', fontSize: '11px', borderRadius: '6px', padding: '4px 8px',
                            flex: 1, height: '28px', outline: 'none',
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddEtapa()}
                    />
                    <button onClick={handleAddEtapa} style={{
                        display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px',
                        color: '#d4a843', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                    }}>
                        <Plus size={14} /> Etapa
                    </button>
                </div>
            )}
        </div>
    );
}
