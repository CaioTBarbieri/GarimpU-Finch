function extrairRegime($, html) {
    const seletoresProvaveis = [
        '[data-testid="availability-tab"]',
        '[data-testid="property-section--content"]',
        '.hprt-roomtype-icon-link',
        '.bui-badge',
        '.hp_hotel_review_score_widget',
        '#hp_hotel_rooms_table'
    ];

    let textoCombinado = '';
    seletoresProvaveis.forEach(sel => {
        $(sel).each((_, el) => {
            textoCombinado += ' ' + $(el).text().toLowerCase();
        });
    });

    const textoCompleto = textoCombinado.trim().length > 0
        ? textoCombinado
        : $('body').text().toLowerCase();

    if (textoCompleto.includes('all inclusive') || textoCompleto.includes('tudo inclu')) return 'All Inclusive';
    if (textoCompleto.includes('pensão completa') || textoCompleto.includes('pensao completa') || textoCompleto.includes('full board')) return 'Pensão completa';
    if (textoCompleto.includes('meia pensão') || textoCompleto.includes('meia pensao') || textoCompleto.includes('half board')) return 'Meia pensão';
    if (textoCompleto.includes('café da manhã inclu') || textoCompleto.includes('pequeno-almoço inclu') || textoCompleto.includes('breakfast included')) return 'Café da manhã incluído';
    if (textoCompleto.includes('café da manhã') || textoCompleto.includes('breakfast')) return 'Café da manhã disponível';

    return 'Não informado';
}

function extrairDistanciaAeroporto($) {
    const regexProximidade = /(?:aeroporto[^.\n]{0,60}?(\d+(?:[.,]\d+)?\s?(?:km|m|mi))|(\d+(?:[.,]\d+)?\s?(?:km|m|mi))[^.\n]{0,20}?aeroporto)/i;

    const seletoresProvaveis = [
        '[data-testid="property-highlights"]',
        '[data-testid="property-location-info"]',
        '[data-testid="distance-to-poi"]',
        '.hp_desc_important_facilities',
        '.important_facility',
        '#hotel_address',
        '.hp-poi-block'
    ];

    for (const sel of seletoresProvaveis) {
        const elementos = $(sel).toArray();
        for (const el of elementos) {
            const txt = $(el).text().trim();
            if (/aeroporto/i.test(txt)) {
                const match = txt.match(regexProximidade);
                if (match) return match[0].replace(/\s+/g, ' ').trim();
            }
        }
    }

    let resultado = 'Não informado';
    $('div, span, li, p').each((_, el) => {
        if (resultado !== 'Não informado') return;
        const $el = $(el);
        if ($el.children().length > 0) return;
        const txt = $el.text().trim();
        if (txt.length > 200) return;
        if (/aeroporto/i.test(txt)) {
            const match = txt.match(regexProximidade);
            if (match) resultado = match[0].replace(/\s+/g, ' ').trim();
        }
    });

    return resultado;
}

module.exports = { extrairRegime, extrairDistanciaAeroporto };