// Intercepta erros do console do Angular para detectar erros do Detran
const originalConsoleError = console.error;
console.error = function() {
    const msg = Array.from(arguments).join(' ').toLowerCase();
    if (msg.includes('veiculo nao pertence') || msg.includes('veículo não pertence')) {
        window.dispatchEvent(new CustomEvent('MATILDE_CRLV_ERROR', {
            detail: 'Veículo não pertence ao usuário logado'
        }));
    } else if (msg.includes('error') && arguments[0] && typeof arguments[0] === 'string' && arguments[0].includes('Veiculo')) {
        window.dispatchEvent(new CustomEvent('MATILDE_CRLV_ERROR', {
            detail: arguments[0]
        }));
    }
    originalConsoleError.apply(console, arguments);
};
