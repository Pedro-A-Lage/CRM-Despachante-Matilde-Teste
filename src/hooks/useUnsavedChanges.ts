import { useEffect } from 'react';

/**
 * Hook que avisa o usuário quando ele tenta fechar ou recarregar a página
 * com alterações não salvas.
 * 
 * Funciona com BrowserRouter (não precisa de data router).
 * Para navegação interna (troca de aba, etc), use window.confirm manualmente.
 */
export function useUnsavedChanges(isDirty: boolean) {
    useEffect(() => {
        if (!isDirty) return;

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = 'Você tem alterações não salvas.';
            return e.returnValue;
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);
}
