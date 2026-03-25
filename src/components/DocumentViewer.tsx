import React, { useState } from 'react';

interface DocumentViewerProps {
    url: string | null | undefined;
    fileName?: string | null;
    isOpen: boolean;
    onClose: () => void;
}

export function DocumentViewer({ url, fileName, isOpen, onClose }: DocumentViewerProps) {
    const [loading, setLoading] = useState(true);

    if (!isOpen || !url) return null;

    // Remove query params para verificar extensão
    const safeUrl = typeof url === 'string' ? url : '';
    const cleanUrl = (safeUrl.split('?')[0] || '').toLowerCase();
    const isImage = cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.webp');
    const isPdf = cleanUrl.endsWith('.pdf') || safeUrl.includes('/storage/v1/object/public/'); // Assume PDF unless proved otherwise. Supabase returns public URLs without extension in paths sometimes, but typically preserves the original stored name.

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden ring-1 ring-gray-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/80">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">{fileName || 'Documento'}</h3>
                            <p className="text-sm text-gray-500">Visualização direta</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                            onClick={() => window.open(url, '_blank')}
                        >
                            Abrir em nova guia
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 relative bg-gray-100 overflow-auto">
                    {loading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gray-50">
                            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                            <span className="text-gray-500 font-medium">Carregando documento...</span>
                        </div>
                    )}

                    {isImage ? (
                        <div className="w-full h-full flex items-center justify-center p-8">
                            <img
                                src={url}
                                alt={fileName || "Documento"}
                                className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
                                onLoad={() => setLoading(false)}
                                onError={() => setLoading(false)}
                            />
                        </div>
                    ) : (
                        <iframe
                            src={`${url}#view=FitH`} // Tenta forçar PDF a caber na tela
                            className={`w-full h-full border-0 transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}
                            title={fileName || "Visualizador de PDF"}
                            onLoad={() => setLoading(false)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
