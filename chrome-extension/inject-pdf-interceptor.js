// Intercepta respostas PDF via XHR/fetch antes de virarem download
(function() {
    if (window.__matildePdfInterceptor) return;
    window.__matildePdfInterceptor = true;

    // Intercepta XMLHttpRequest
    var origXhrOpen = XMLHttpRequest.prototype.open;
    var origXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
        this.__matildeUrl = url;
        return origXhrOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            try {
                var ct = (this.getResponseHeader('content-type') || '').toLowerCase();
                var url = (this.__matildeUrl || '').toLowerCase();
                if (ct.includes('pdf') || url.includes('crlv') || url.includes('pdf')) {
                    var blob;
                    if (this.response instanceof Blob) blob = this.response;
                    else if (this.response instanceof ArrayBuffer) blob = new Blob([this.response], {type:'application/pdf'});
                    else return;

                    var reader = new FileReader();
                    reader.onloadend = function() {
                        window.postMessage({
                            source: 'MATILDE_PDF_INTERCEPTED',
                            pdfBase64: reader.result,
                            url: this.__matildeUrl || ''
                        }, '*');
                    }.bind(this);
                    reader.readAsDataURL(blob);
                }
            } catch(e) {}
        });
        return origXhrSend.apply(this, arguments);
    };

    // Intercepta fetch
    var origFetch = window.fetch;
    window.fetch = function() {
        var url = (arguments[0] && typeof arguments[0] === 'string') ? arguments[0] :
                    (arguments[0] && arguments[0].url) ? arguments[0].url : '';
        return origFetch.apply(this, arguments).then(function(response) {
            var ct = (response.headers.get('content-type') || '').toLowerCase();
            var urlLower = url.toLowerCase();
            if (ct.includes('pdf') || urlLower.includes('crlv') || urlLower.includes('pdf')) {
                response.clone().blob().then(function(blob) {
                    if (blob.size > 5000) {
                        var reader = new FileReader();
                        reader.onloadend = function() {
                            window.postMessage({
                                source: 'MATILDE_PDF_INTERCEPTED',
                                pdfBase64: reader.result,
                                url: url
                            }, '*');
                        };
                        reader.readAsDataURL(blob);
                    }
                }).catch(function() {});
            }
            return response;
        });
    };
})();
