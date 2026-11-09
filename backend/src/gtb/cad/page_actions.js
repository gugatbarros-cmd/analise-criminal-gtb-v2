// A função é enviada à aba autenticada do CAD pelo protocolo de depuração do navegador.
// Ela usa apenas o DOM da página aberta e retorna dados de controle, nunca registros da consulta.
function cadPageAction(action, options = {}) {
  const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const visible = (element) => !!element && !element.disabled && !!element.getClientRects().length;
  const exact = (element, label) => normalize(element.textContent || element.value) === normalize(label);
  const controls = 'button,input[type="button"],input[type="submit"],a,[role="button"]';
  const click = (label) => {
    const matches = [...document.querySelectorAll(controls)].filter((element) => visible(element) && exact(element, label));
    if (!matches.length || (matches.length > 1 && label !== 'Pesquisar')) return { ok: false, reason: `${label}: ${matches.length} botão(ões) encontrados.` };
    setTimeout(() => matches[0].click(), 0);
    return { ok: true };
  };
  const rowFor = (label) => {
    const labels = [...document.querySelectorAll('label,th,td,span,strong')]
      .filter((element) => visible(element) && exact(element, label));
    return labels.find((element) => element.closest('tr'))?.closest('tr') || null;
  };
  if (action === 'date') {
    const row = rowFor('Data da Ocorrência');
    const selects = [...(row?.querySelectorAll('select') || [])].filter(visible);
    if (selects.length !== 1) return { ok: false, reason: 'Não foi possível identificar o filtro Data da Ocorrência.' };
    const select = selects[0];
    const option = [...select.options].find((item) => /^(ULTIMOS|ULTIMAS) 30 DIAS(?:\b|\s*[-(:])/.test(normalize(item.textContent)));
    if (!option) return { ok: false, reason: 'O CAD não oferece a opção Últimos 30 dias no filtro de data. Informe a opção disponível para configurar o período com segurança.' };
    select.value = option.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, period: option.textContent.trim() };
  }
  if (action === 'dateRangeMode') {
    const row = rowFor('Data da Ocorrência');
    const selects = [...(row?.querySelectorAll('select') || [])].filter(visible);
    if (selects.length !== 1) return { ok: false, reason: 'O filtro Data da Ocorrência não foi identificado de forma única.' };
    const option = [...selects[0].options].find((item) => normalize(item.textContent) === 'INTERVALO');
    if (!option) return { ok: false, reason: 'A opção Intervalo não foi encontrada no filtro Data da Ocorrência.' };
    selects[0].value = option.value;
    selects[0].dispatchEvent(new Event('input', { bubbles: true }));
    selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  }
  if (action === 'dateRangeValues') {
    const row = rowFor('Data da Ocorrência');
    const selects = [...(row?.querySelectorAll('select') || [])].filter(visible);
    const selected = selects.length === 1 && [...selects[0].options].find((item) => item.value === selects[0].value);
    if (!selected || normalize(selected.textContent) !== 'INTERVALO') {
      return { ok: false, reason: 'O CAD não confirmou a opção Intervalo.' };
    }
    const fields = [...row.querySelectorAll('input')].filter((item) => visible(item) && ['text', 'number', 'tel'].includes(item.type));
    // A grade de Drogas inclui segundos nos dois extremos; outras grades usam
    // apenas dia, mês, ano, hora e minuto. Confere a estrutura antes de preencher.
    const fieldsPerDate = fields.length / 2;
    const lengths = fieldsPerDate === 6 ? [2, 2, 4, 2, 2, 2, 2, 2, 4, 2, 2, 2]
      : [2, 2, 4, 2, 2, 2, 2, 4, 2, 2];
    if (![5, 6].includes(fieldsPerDate) || fields.some((item, index) => item.maxLength !== lengths[index])) {
      return { ok: false, reason: 'Os campos do intervalo não correspondem ao formato de data e hora do CAD. Confira a tela antes de continuar.' };
    }
    const values = [];
    for (const [date, hour, minute] of [[options.startDate, '00', '00'], [options.endDate, '23', '59']]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return { ok: false, reason: 'Data do intervalo inválida.' };
      const [year, month, day] = date.split('-');
      values.push(day, month, year, hour, minute);
      if (fieldsPerDate === 6) values.push(hour === '00' ? '00' : '59');
    }
    fields.forEach((field, index) => {
      field.value = values[index];
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (fields.some((field, index) => field.value !== values[index])) {
      return { ok: false, reason: 'O CAD não manteve as datas informadas no intervalo.' };
    }
    return { ok: true };
  }
  if (['scope', 'agency', 'unit'].includes(action)) {
    const fields = action === 'agency' ? [['Órgão', 'POLÍCIA MILITAR']]
      : action === 'unit' ? [['Unidade', '10º BPM']]
      : [['Órgão', 'POLÍCIA MILITAR'], ['Unidade', '10º BPM']];
    for (const [label, expected] of fields) {
      const row = rowFor(label);
      const lists = [...(row?.querySelectorAll('select[multiple],select[size]') || [])].filter(visible);
      if (lists.length < 2) return { ok: false, reason: `Não foi possível identificar as listas de ${label}.` };
      const source = lists[0];
      const target = lists.at(-1);
      if (![...target.options].some((item) => normalize(item.textContent) === normalize(expected))) {
        const option = [...source.options].find((item) => normalize(item.textContent) === normalize(expected));
        if (!option) return { ok: false, reason: `${expected} não aparece no filtro ${label}.` };
        for (const item of source.options) item.selected = false;
        option.selected = true;
        source.dispatchEvent(new Event('change', { bubbles: true }));
        const left = source.getBoundingClientRect();
        const right = target.getBoundingClientRect();
        const arrows = [...row.querySelectorAll('button,a,input[type="button"],input[type="image"],img')]
          .filter((element) => {
            if (!visible(element)) return false;
            const box = element.getBoundingClientRect();
            const center = box.left + box.width / 2;
            return center >= left.right && center <= right.left && box.top >= Math.min(left.top, right.top) && box.bottom <= Math.max(left.bottom, right.bottom) + 12;
          })
          .filter((element) => !element.closest('a,button') || element.matches('a,button'))
          .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        const singleRight = arrows.find((element) => /^(>|▶|►)$/.test((element.textContent || element.alt || element.title || '').trim())) || (arrows.length === 4 ? arrows[1] : null);
        if (!singleRight) return { ok: false, reason: `Não foi possível identificar a seta que seleciona ${expected} no CAD. Envie uma captura dessa parte da tela.` };
        singleRight.click();
      }
      const inTarget = [...target.options].some((item) => normalize(item.textContent) === normalize(expected));
      if (!inTarget) return { ok: false, reason: `O CAD não confirmou a seleção de ${expected} no filtro ${label}. Envie uma captura dessa parte da tela.` };
      const other = [...target.options].filter((item) => normalize(item.textContent) !== normalize(expected));
      if (other.length) return { ok: false, reason: `O filtro ${label} inclui mais opções além de ${expected}. Deixe somente ${expected} selecionado.` };
    }
    return { ok: true };
  }
  if (action === 'dispatchUnit') {
    const row = rowFor('Unidade Despacho') || rowFor('Unidade de Despacho');
    if (!row) return { ok: false, reason: 'O filtro Unidade de Despacho não foi identificado.' };
    const lists = [...row.querySelectorAll('select')].filter(visible);
    if (lists.length === 1 && !lists[0].multiple) {
      const option = [...lists[0].options].find((item) => normalize(item.textContent) === '10º BPM');
      if (!option) return { ok: false, reason: '10º BPM não aparece em Unidade de Despacho.' };
      lists[0].value = option.value;
      lists[0].dispatchEvent(new Event('change', { bubbles: true }));
      return normalize(lists[0].selectedOptions?.[0]?.textContent || option.textContent) === '10º BPM'
        ? { ok: true } : { ok: false, reason: 'O CAD não confirmou a Unidade de Despacho 10º BPM.' };
    }
    if (lists.length < 2) return { ok: false, reason: 'As listas de Unidade de Despacho não foram identificadas.' };
    const source = lists[0], target = lists.at(-1);
    if (![...target.options].some((item) => normalize(item.textContent) === '10º BPM')) {
      const option = [...source.options].find((item) => normalize(item.textContent) === '10º BPM');
      if (!option) return { ok: false, reason: '10º BPM não aparece em Unidade de Despacho.' };
      for (const item of source.options) item.selected = false;
      option.selected = true;
      source.dispatchEvent(new Event('change', { bubbles: true }));
      const left = source.getBoundingClientRect(), right = target.getBoundingClientRect();
      const arrows = [...row.querySelectorAll('button,a,input[type="button"],input[type="image"],img')]
        .filter((item) => visible(item) && item.getBoundingClientRect().left >= left.right && item.getBoundingClientRect().right <= right.left)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const arrow = row.querySelector('a#Bbpassfld_righ')
        || arrows.find((item) => item.tagName === 'A' && normalize(item.title) === 'CAMPO MOVER PARA A DIREITA')
        || arrows.find((item) => /^(>|▶|►)$/.test((item.textContent || item.alt || item.title || '').trim()))
        || (arrows.length === 4 ? arrows[1] : null);
      if (!arrow) return { ok: false, reason: 'A seta de Unidade de Despacho não foi identificada.' };
      arrow.click();
    }
    return target.options.length === 1 && normalize(target.options[0].textContent) === '10º BPM'
      ? { ok: true } : { ok: false, reason: 'A Unidade de Despacho deve conter somente 10º BPM.' };
  }
  if (action === 'titular') {
    const row = rowFor('Titular ou Apoio na ocorrência?');
    if (!row) return { ok: false, reason: 'O filtro Titular ou Apoio na ocorrência? não foi identificado.' };
    const selects = [...row.querySelectorAll('select')].filter(visible);
    if (selects.length >= 2 && selects.every((item) => item.multiple)) {
      const source = selects[0], target = selects.at(-1);
      if (![...target.options].some((item) => normalize(item.textContent) === 'TITULAR')) {
        const option = [...source.options].find((item) => normalize(item.textContent) === 'TITULAR');
        if (!option) return { ok: false, reason: 'A opção Titular não aparece no filtro.' };
        for (const item of source.options) item.selected = false;
        option.selected = true;
        source.dispatchEvent(new Event('change', { bubbles: true }));
        const left = source.getBoundingClientRect(), right = target.getBoundingClientRect();
        const arrows = [...row.querySelectorAll('button,a,input[type="button"],input[type="image"],img')]
          .filter((item) => visible(item) && item.getBoundingClientRect().left >= left.right && item.getBoundingClientRect().right <= right.left)
          .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        const arrow = arrows.find((item) => item.tagName === 'A' && normalize(item.title) === 'CAMPO MOVER PARA A DIREITA')
          || (arrows.length === 4 ? arrows[1] : null);
        if (!arrow) return { ok: false, reason: 'A seta para selecionar Titular não foi identificada.' };
        arrow.click();
      }
      return target.options.length === 1 && normalize(target.options[0].textContent) === 'TITULAR'
        ? { ok: true } : { ok: false, reason: 'Deixe somente Titular na lista da direita.' };
    }
    if (selects.length === 1 && !selects[0].multiple) {
      const option = [...selects[0].options].find((item) => normalize(item.textContent) === 'TITULAR');
      if (!option) return { ok: false, reason: 'A opção Titular não aparece no filtro.' };
      selects[0].value = option.value;
      selects[0].dispatchEvent(new Event('change', { bubbles: true }));
      return normalize(selects[0].selectedOptions?.[0]?.textContent) === 'TITULAR'
        ? { ok: true } : { ok: false, reason: 'O CAD não confirmou Titular.' };
    }
    const radios = [...row.querySelectorAll('input[type="radio"]')].filter(visible);
    const radio = radios.find((item) => normalize(item.value) === 'TITULAR' || normalize(item.closest('label')?.textContent) === 'TITULAR');
    if (!radio) return { ok: false, reason: 'A opção Titular não foi identificada.' };
    radio.click();
    return radio.checked ? { ok: true } : { ok: false, reason: 'O CAD não confirmou Titular.' };
  }
  if (action === 'columnInventory' || action === 'columns') {
    if (options.grade === 'drugs') {
      const available = [...document.querySelectorAll('ul.sc_ui_fldsel_available')].find(visible);
      const selected = [...document.querySelectorAll('ul.sc_ui_fldsel_selected')].find(visible);
      if (!available || !selected) {
        return { ok: false, reason: 'As listas de colunas de Drogas não apareceram no CAD.' };
      }
      const outside = [...available.querySelectorAll('li')].filter(visible);
      if (action === 'columns') {
        if (outside.length) return { ok: false, reason: `${outside.length} coluna(s) de Drogas ainda estão à esquerda.` };
        return click('Aplicar');
      }
      if (!outside.length) return { ok: true, count: 0 };
      const target = [...selected.querySelectorAll('li')].find(visible);
      if (!target) return { ok: false, reason: 'A lista de colunas selecionadas de Drogas está vazia.' };
      const source = outside[0];
      source.scrollIntoView({ block: 'center', inline: 'nearest' });
      const from = source.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      return { ok: true, count: outside.length,
        from: { x: from.left + from.width / 2, y: from.top + from.height / 2 },
        to: { x: to.left + to.width / 2, y: from.top + from.height / 2 } };
    }
    const required = [
      ['Data da Ocorrência', 'Data / Hora da Ocorrência'],
      ['Nº Ocorrência'], ['Cidade'], ['Natureza Geral'], ['Tipificação Geral'], ['Unidade']
    ];
    const hasLabel = (element, names) => names.some((name) => exact(element, name));
    const panels = [...document.querySelectorAll('div,ul,ol,td')].filter((element) => {
      if (!visible(element)) return false;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return /dotted|dashed/.test(`${style.borderLeftStyle} ${style.borderTopStyle}`) && box.width >= 80 && box.height >= 80;
    }).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const left = panels[0]?.getBoundingClientRect();
    if (!left) return { ok: false, reason: 'Não foi possível identificar as áreas de seleção das colunas no CAD.' };
    const labels = [...document.querySelectorAll('li,td,div,span')].filter(visible);
    const selected = labels.find((element) => (options.grade === 'drugs' || required.some((names) => hasLabel(element, names)))
      && element.getBoundingClientRect().left >= left.right - 5 && !element.children.length && normalize(element.textContent));
    if (!selected) return { ok: false, reason: 'A lista de colunas selecionadas à direita não foi identificada.' };
    const outside = labels.filter((element) => !element.children.length && normalize(element.textContent)
      && element.getBoundingClientRect().left >= left.left && element.getBoundingClientRect().right <= left.right
      && element.getBoundingClientRect().top >= left.top && element.getBoundingClientRect().bottom <= left.bottom);
    if (action === 'columnInventory') {
      const source = outside[0];
      if (!source) return { ok: true, count: 0 };
      source.scrollIntoView({ block: 'center', inline: 'nearest' });
      const from = source.getBoundingClientRect();
      const to = selected.getBoundingClientRect();
      return { ok: true, count: outside.length,
        from: { x: from.left + from.width / 2, y: from.top + from.height / 2 },
        to: { x: to.left + to.width / 2, y: from.top + from.height / 2 } };
    }
    const missing = (options.grade === 'drugs' ? [] : required).filter((names) => !labels.some((element) => hasLabel(element, names)
      && element.getBoundingClientRect().left >= left.right - 5));
    if (missing.length) return { ok: false, reason: `Estas colunas ainda não estão selecionadas para exportação: ${missing.map((names) => names.join(' / ')).join(', ')}.` };
    if (outside.length) return { ok: false, reason: `${outside.length} coluna(s) ainda estão fora da exportação. Selecione-as no CAD antes de aplicar.` };
    return click('Aplicar');
  }
  if (action === 'xls') {
    const buttons = [...document.querySelectorAll(controls)].filter((element) => visible(element) && exact(element, 'XLS'));
    if (buttons.length === 1) {
      setTimeout(() => buttons[0].click(), 0);
      return { ok: true };
    }
    if (buttons.length > 1) return { ok: false, reason: 'A opção XLS apareceu mais de uma vez no menu.' };
    const items = [...document.querySelectorAll('li,[role="menuitem"]')].filter((element) => visible(element) && exact(element, 'XLS'));
    if (items.length === 1) {
      setTimeout(() => items[0].click(), 0);
      return { ok: true };
    }
    const options = [...document.querySelectorAll('select option')]
      .filter((element) => visible(element.parentElement) && exact(element, 'XLS'));
    if (items.length || options.length !== 1) return { ok: false, reason: `A opção XLS não foi identificada de forma única (${items.length + options.length}).` };
    const target = options[0];
    target.parentElement.value = target.value;
    setTimeout(() => target.parentElement.dispatchEvent(new Event('change', { bubbles: true })), 0);
    return { ok: true };
  }
  return click({ search: 'Pesquisar', advancedSearch: 'Pesquisa Avançada', columnMenu: 'Colunas', exportMenu: 'Exportação', download: 'Baixar' }[action] || '');
}
