/* Relatório temático: um modelo visual compartilhado por prévia, PDF e PPTX. */
(() => {
  'use strict';
  const reportBase = document.currentScript.src;
  const W = 1600, H = 900;
  const colors = { ink: '40243B', accent: '86536F', lilac: 'DCCBDD', paper: 'FBF7F1', muted: '705D6B', clay: 'BF735C', light: 'F0E8ED', white: 'FFFFFF' };
  const artPath = new URL('./acolhimento-mulheres.png', reportBase).href;
  const headerLogoPath = new URL('./logo-10bpm-3d-ui.png', reportBase).href;
  const logoPath = new URL('./logo-10bpm-3d-estatistica.png', reportBase).href;
  const palette = ['7C3AED', '0891B2', 'D97706', 'DB2777', '059669', '2563EB', 'DC2626', '9333EA'];
  const sections = [
    ['overview', 'Panorama e leitura executiva'], ['periods', 'Comparação e distribuição mensal'],
    ['time', 'Horários, turnos e dias da semana'], ['aggression', 'Naturezas, agressões e meios'],
    ['territory', 'Municípios e bairros'], ['profile', 'Perfil informado e vínculos'],
    ['outcomes', 'Soluções e encaminhamentos'], ['notes', 'Análise e encaminhamentos do responsável']
  ];
  const format = (value) => Number(value || 0).toLocaleString('pt-BR');
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const isMissing = (label) => /^(?:não informad|nao informad|sem informa|ignorado|—)/i.test(label);
  const percent = (value, total) => total ? `${(100 * value / total).toFixed(1).replace('.', ',')}%` : '—';

  function linesFor(value, width, size, maxLines = 99) {
    const limit = Math.max(5, Math.floor(width / (size * 0.56)));
    const result = [];
    for (const paragraph of String(value ?? '').split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (line && line.length + word.length + 1 > limit) { result.push(line); line = ''; }
        if (word.length > limit) {
          if (line) { result.push(line); line = ''; }
          for (let index = 0; index < word.length; index += limit) result.push(word.slice(index, index + limit));
        } else line += `${line ? ' ' : ''}${word}`;
      }
      if (line || !paragraph) result.push(line);
    }
    if (result.length > maxLines) return [...result.slice(0, maxLines - 1), result[maxLines - 1].slice(0, Math.max(1, limit - 1)) + '…'];
    return result;
  }
  const text = (slide, value, x, y, width, size = 28, color = colors.ink, bold = false, maxLines = 99) => {
    const lines = linesFor(value, width, size, maxLines);
    slide.items.push({ kind: 'text', text: lines.join('\n'), lines, x, y, w: width, h: lines.length * size * 1.25 + 8, size, color, bold });
  };
  const rect = (slide, x, y, w, h, fill) => slide.items.push({ kind: 'rect', x, y, w, h, fill });
  const picture = (slide, x, y, w, h, src = artPath) => slide.items.push({ kind: 'image', x, y, w, h, src });
  function base(title, eyebrow = 'VIOLÊNCIA DOMÉSTICA E CONTRA A MULHER') {
    const slide = { title, items: [] };
    rect(slide, 0, 0, W, H, colors.paper);
    rect(slide, 0, 0, 18, H, colors.accent);
    text(slide, eyebrow, 90, 48, 1270, 20, colors.accent, true, 1);
    text(slide, title, 90, 95, 1270, 50, colors.ink, true, 2);
    picture(slide, 1378, 28, 140, 140, headerLogoPath);
    return slide;
  }
  function peak(entries = []) {
    const valid = entries.filter(([label, count]) => !isMissing(label) && count > 0).sort((a, b) => b[1] - a[1]);
    if (!valid.length) return 'Sem informação suficiente';
    const tied = valid.filter((item) => item[1] === valid[0][1]).length;
    return `${valid[0][0]} · ${format(valid[0][1])} registro(s)${tied > 1 ? ` (empate entre ${tied} categorias)` : ''}`;
  }
  function buildSlides(data, options = {}) {
    const chosen = new Set(options.sections || sections.map(([key]) => key));
    const slides = [], groups = data.groups || {};
    const total = data.total || 0;
    const title = options.title || 'Violência doméstica e contra a mulher';
    const subtitle = options.subtitle || 'Análise estatística para apresentação';
    const unit = options.unit || 'Polícia Militar de Alagoas · 10º BPM';
    const author = options.author || 'Equipe de análise criminal';
    const issued = options.issued || new Date().toLocaleString('pt-BR');
    const cover = base(title, 'RELATÓRIO TEMÁTICO • 10º BPM');
    cover.items = [];
    rect(cover, 0, 0, W, H, colors.ink);
    picture(cover, 960, 0, 640, 900);
    // A arte mantém proporção; faixa editorial delimita a área do título.
    rect(cover, 0, 0, 960, H, colors.ink);
    rect(cover, 80, 82, 84, 7, colors.clay);
    text(cover, 'RELATÓRIO TEMÁTICO', 80, 116, 800, 22, colors.lilac, true, 1);
    picture(cover, 724, 30, 155, 155, headerLogoPath);
    text(cover, title, 80, 192, 790, 66, colors.white, true, 4);
    text(cover, subtitle, 80, 558, 780, 28, colors.lilac, false, 2);
    text(cover, data.period, 80, 655, 780, 23, colors.white, false, 2);
    text(cover, `${unit}\n${author}`, 80, 752, 790, 21, colors.lilac, false, 2);
    slides.push(cover);

    if (chosen.has('overview')) {
      const slide = base('Panorama do recorte');
      // No panorama, um único brasão em destaque evita a repetição no cabeçalho.
      slide.items = slide.items.filter((item) => item.src !== headerLogoPath);
      rect(slide, 90, 245, 980, 455, colors.ink);
      text(slide, format(total), 140, 295, 870, Math.min(180, Math.floor(870 / (format(total).length * 0.6))), colors.white, true, 1);
      text(slide, 'Total de ocorrências no recorte', 140, 580, 860, 36, colors.lilac, false, 2);
      picture(slide, 1100, 245, 430, 430, logoPath);
      slides.push(slide);
      const reading = base('Principais concentrações observadas');
      [['Território', peak(data.cities)], ['Turno', peak(groups.Turno)], ['Natureza', peak(groups['Natureza registrada'])]].forEach(([label, value], index) => {
        const y = 240 + index * 170;
        rect(reading, 90, y, 9, 120, colors.clay);
        text(reading, label.toUpperCase(), 125, y, 1300, 21, colors.accent, true, 1);
        text(reading, value, 125, y + 42, 1300, 32, colors.ink, true, 2);
      });
      text(reading, 'Concentração observada não comprova maior risco: volume, cobertura da base e preenchimento devem ser considerados.', 90, 770, 1400, 21, colors.muted, false, 2);
      slides.push(reading);
    }

    function narrative(heading, body) {
      const wrapped = linesFor(body || 'Sem observações adicionais.', 965, 29);
      const chunks = [];
      for (let offset = 0; offset < wrapped.length; offset += 13) chunks.push(wrapped.slice(offset, offset + 13).join('\n'));
      chunks.forEach((chunk, index) => {
        const slide = base(`${heading}${chunks.length > 1 ? ` · ${index + 1}/${chunks.length}` : ''}`);
        rect(slide, 90, 240, 1050, 540, colors.light);
        text(slide, chunk.trim(), 130, 282, 965, 29, colors.ink, false, 13);
        picture(slide, 1185, 315, 320, 320);
        slides.push(slide);
      });
    }
    function bars(heading, entries = [], extraNote = '') {
      let values = entries.filter(([, count]) => Number.isFinite(count) && count >= 0);
      values = [...values].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'pt-BR'));
      if (!values.length) { narrative(heading, 'Não há dados disponíveis para esta dimensão no recorte selecionado.'); return; }
      for (let offset = 0; offset < values.length; offset += 8) {
        const page = values.slice(offset, offset + 8);
        const slide = base(`${heading}${values.length > 8 ? ` · ${offset + 1}–${offset + page.length}` : ''}`);
        slide.chartEntries = page.map(([label, count]) => [label, count]);
        const max = Math.max(1, ...values.map(([, count]) => count));
        page.forEach(([label, count], index) => {
          const y = 233 + index * 66;
          text(slide, label, 90, y, 460, 23, colors.ink, false, 2);
          rect(slide, 578, y + 4, 686, 30, colors.light);
          if (count) rect(slide, 578, y + 4, 686 * count / max, 30, isMissing(label) ? colors.muted : palette[(offset + index) % palette.length]);
          text(slide, `${format(count)} · ${percent(count, total)}`, 1300, y, 230, 24, colors.ink, true, 1);
        });
        text(slide, `Maior → menor. Percentuais sobre ${format(total)} ocorrência(s). ${extraNote || 'Dados ausentes identificados; rótulos longos podem ser abreviados.'}`, 90, 786, 1390, 20, colors.muted, false, 2);
        slides.push(slide);
      }
    }
    if (data.screening) {
      narrative('Conferência dos registros do tema', `${format(data.screening.screened)} ocorrência(s) relacionada(s) ao tema no recorte.\n${format(total)} reconhecida(s) no registro.\n${format(data.screening.excluded)} não configurada(s) no atendimento.\n${format(data.screening.pending)} pendente(s) de conferência.\n${format(data.screening.outside)} fora do recorte feminino.\n\nSomente as reconhecidas integram os gráficos de violência. Pendência não comprova ausência do fato. Os originais são preservados.`);
      if (data.screening.reasons?.length) narrative('Motivos dos registros fora dos totais', data.screening.reasons.map(([reason, count]) => `${format(count)} ocorrência(s): ${reason}`).join('\n\n'));
    }
    if (chosen.has('periods')) { narrative('Avaliação de períodos', data.comparison); bars('Ocorrências por mês', data.months); }
    if (chosen.has('time')) {
      bars('Distribuição por turno', groups.Turno);
      bars('Dias da semana', groups['Dia da semana']);
      const slide = base('Horários das ocorrências');
      const hours = groups['Horário'] || [];
      const valid = hours.filter(([label]) => /^\d{2}h$/.test(label)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      slide.chartEntries = valid.map(([label, count]) => [label, count]);
      const max = Math.max(1, ...valid.map(([, value]) => value));
      valid.forEach(([label, value], index) => {
        const x = 92 + index * 59, height = value / max * 360;
        rect(slide, x, 665 - height, 38, height || 1, palette[index % palette.length]);
        text(slide, format(value), x - 6, 620 - height, 56, 19, colors.ink, true, 1);
        text(slide, label.slice(0, 2), x - 2, 690, 60, 20, colors.muted, false, 1);
      });
      text(slide, `Horários ordenados do maior para o menor total. ${format(data.missingHour)} ocorrência(s) sem horário válido fora das barras.`, 90, 770, 1390, 24, colors.muted, false, 2);
      slides.push(slide);
    }
    if (chosen.has('aggression')) {
      if (data.typifications) bars('Condutas identificadas no registro', data.typifications, 'Uma ocorrência pode ter várias condutas; percentuais podem somar mais de 100%.');
      bars('Naturezas registradas', groups['Natureza registrada']);
      bars('Tipos de agressão informados', groups['Tipo de agressão informado']);
      bars('Meios empregados informados', groups['Meio empregado informado']);
    }
    if (chosen.has('territory')) { bars('Distribuição por município', data.cities); bars('Bairros e municípios', groups.Bairro); }
    if (chosen.has('profile')) {
      bars('Sexo/gênero da vítima informado', groups['Sexo/gênero da vítima informado']);
      bars('Faixas etárias informadas', groups['Faixa etária da vítima']);
      bars('Vínculos informados', groups['Vínculo informado']);
    }
    if (chosen.has('outcomes')) bars('Soluções e encaminhamentos', groups['Solução / encaminhamento']);
    if (chosen.has('notes')) {
      narrative('Análise do responsável', options.notes?.trim() || 'Espaço reservado à avaliação do responsável. Registre a leitura do cenário, as limitações da base e os pontos que precisam ser conferidos antes da apresentação.');
      if (options.actions?.trim()) narrative('Encaminhamentos propostos', options.actions.trim());
    }
    narrative('Qualidade e limites dos dados', `Apenas registros correntes processados. Históricos e quarentena são conferidos no sistema local; ${format(data.missingDate)} ocorrência(s) sem data válida; ${format(data.missingHour)} sem horário válido; ${format(data.invalidAge)} com idade inválida.\n\nA identificação de violência doméstica segue o classificador da base. Marcadores explícitos não equivalem a confirmação judicial ou precisão estatística validada. Dados ausentes não são convertidos em ocorrências iguais a zero. Os registros originais são preservados.`);
    narrative('Fonte e memória do relatório', `Fonte: base operacional carregada no sistema.\nPeríodo: ${data.period}.\nFiltros: ${data.filters}.\nGerado em: ${issued}. Versão: ${data.version}.\n\nOs quadros apresentam ocorrências reconhecidas e deduplicadas. O perfil feminino depende de campo explícito da vítima. A existência de registros não garante cobertura completa do período.\n\nIlustração editorial gerada por IA; não representa vítimas reais. Conteúdo estatístico agregado, sem relação nominal de envolvidos.`);
    slides.forEach((slide, index) => {
      if (index) {
        rect(slide, 90, 842, 1415, 2, colors.lilac);
        text(slide, unit, 90, 854, 1170, 17, colors.muted, false, 1);
      }
      text(slide, `${String(index + 1).padStart(2, '0')} / ${slides.length}`, index ? 1380 : 790, 853, 130, 17, index ? colors.muted : colors.lilac, false, 1);
    });
    return slides;
  }

  function toSvg(slide, images = {}) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escape(slide.title)}">${slide.items.map((item) => {
      if (item.kind === 'rect') return `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" fill="#${item.fill}"/>`;
      if (item.kind === 'image') return `<image href="${escape(images[item.src] || item.src)}" x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" preserveAspectRatio="xMidYMid ${item.src !== artPath ? 'meet' : 'slice'}"/>`;
      return `<text fill="#${item.color}" font-family="Arial, sans-serif" font-size="${item.size}" font-weight="${item.bold ? 700 : 400}">${item.lines.map((line, index) => `<tspan x="${item.x}" y="${item.y + item.size + index * item.size * 1.25}">${escape(line)}</tspan>`).join('')}</text>`;
    }).join('')}</svg>`;
  }
  async function makePptx(slides, options, images, Constructor = window.PptxGenJS || window.pptxgen) {
    const pptx = new Constructor();
    pptx.defineLayout({ name: 'DOMESTIC', width: W / 120, height: H / 120 });
    pptx.layout = 'DOMESTIC';
    pptx.author = options.author || '10º BPM';
    pptx.subject = 'Violência doméstica e contra a mulher';
    pptx.title = options.title || pptx.subject;
    pptx.lang = 'pt-BR';
    slides.forEach((scene) => {
      const slide = pptx.addSlide();
      scene.items.forEach((item) => {
        const position = { x: item.x / 120, y: item.y / 120, w: item.w / 120, h: item.h / 120 };
        if (item.kind === 'rect') slide.addShape(pptx.ShapeType.rect, { ...position, line: { color: item.fill, transparency: 100 }, fill: { color: item.fill } });
        else if (item.kind === 'image') {
          if (!images[item.src]) throw new Error('Imagem do relatório indisponível. Reabra o editor e tente novamente.');
          slide.addImage({ data: images[item.src], ...position, sizing: { type: item.src !== artPath ? 'contain' : 'cover', w: position.w, h: position.h }, altText: item.src !== artPath ? 'Logo do 10º BPM' : 'Ilustração de acolhimento e proteção às mulheres' });
        }
        else slide.addText(item.text, { ...position, fontFace: 'Arial', fontSize: item.size * 0.6, bold: item.bold, color: item.color, margin: 0, breakLine: false, valign: 'top', paraSpaceAfter: 0, lineSpacingMultiple: 1.04, fit: 'shrink' });
      });
    });
    return pptx;
  }

  let dialog, snapshot, authorization, slideIndex = 0, currentSlides = [], imagePromise, libraryPromise, busy = false;
  function imageData() {
    if (!imagePromise) imagePromise = Promise.all([artPath, logoPath, headerLogoPath].map(async (src) => {
      const response = await fetch(src);
      if (!response.ok) throw new Error('Não foi possível carregar a ilustração ou a logo do 10º BPM.');
      const blob = await response.blob();
      const encoded = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
      });
      return [src, encoded];
    })).then(Object.fromEntries).catch((error) => { imagePromise = null; throw error; });
    return imagePromise;
  }
  function loadPowerPoint() {
    if (window.PptxGenJS || window.pptxgen) return Promise.resolve();
    if (!libraryPromise) libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = new URL('./pptxgen.bundle.js', reportBase).href;
      script.onload = resolve; script.onerror = () => { script.remove(); libraryPromise = null; reject(new Error('Não foi possível carregar o exportador PowerPoint. Tente novamente.')); };
      document.head.append(script);
    });
    return libraryPromise;
  }
  function options() {
    const field = (name) => dialog.querySelector(`[name="${name}"]`).value.trim();
    return { title: field('title'), subtitle: field('subtitle'), unit: field('unit'), author: field('author'), notes: field('notes'), actions: field('actions'), issued: snapshot.issued,
      sections: [...dialog.querySelectorAll('[name="section"]:checked')].map((el) => el.value) };
  }
  function status(message) { dialog.querySelector('[data-status]').textContent = message; }
  function refresh() {
    currentSlides = buildSlides(snapshot, options());
    slideIndex = Math.min(slideIndex, currentSlides.length - 1);
    dialog.querySelector('[data-slide]').innerHTML = toSvg(currentSlides[slideIndex]);
    dialog.querySelector('[data-counter]').textContent = `${slideIndex + 1} de ${currentSlides.length} · ${currentSlides[slideIndex].title}`;
    dialog.querySelector('[data-prev]').disabled = slideIndex === 0;
    dialog.querySelector('[data-next]').disabled = slideIndex === currentSlides.length - 1;
    dialog.querySelector('[data-outline]').innerHTML = currentSlides.map((slide, index) => `<button type="button" data-goto="${index}" aria-current="${index === slideIndex ? 'step' : 'false'}">${String(index + 1).padStart(2, '0')} <span>${escape(slide.title)}</span></button>`).join('');
  }
  function printDocument(slides, image) {
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório — violência doméstica</title><style>@page{size:320mm 180mm;margin:0}*{box-sizing:border-box}body{margin:0;background:#ddd}article{width:320mm;height:180mm;break-after:page;page-break-after:always;overflow:hidden;background:#fff}article:last-child{break-after:auto;page-break-after:auto}svg{display:block;width:100%;height:100%}@media screen{article{margin:20px auto;box-shadow:0 4px 30px #0002}}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff}}</style></head><body>${slides.map((slide) => `<article>${toSvg(slide, image)}</article>`).join('')}</body></html>`;
  }
  async function exportReport(kind) {
    if (busy) return;
    if (!authorization?.()) { status('Somente o administrador pode exportar relatórios.'); return; }
    busy = true;
    dialog.querySelectorAll('[data-export]').forEach((button) => { button.disabled = true; });
    // A nova janela é aberta no gesto do usuário para evitar bloqueio de pop-up.
    const printWindow = kind === 'pdf' ? window.open('', '_blank') : null;
    if (kind === 'pdf' && !printWindow) {
      busy = false; dialog.querySelectorAll('[data-export]').forEach((button) => { button.disabled = false; });
      status('O navegador bloqueou a janela. Permita pop-ups deste site e tente novamente.'); return;
    }
    try {
      status(kind === 'pdf' ? 'Preparando páginas ilustradas para PDF…' : 'Preparando o PowerPoint editável…');
      const selectedOptions = options();
      const slides = buildSlides(snapshot, selectedOptions);
      const image = await imageData();
      if (!authorization?.()) throw new Error('Sua permissão de exportação não está mais ativa.');
      if (kind === 'pptx') {
        await loadPowerPoint();
        const pptx = await makePptx(slides, selectedOptions, image);
        await pptx.writeFile({ fileName: `violencia-domestica-${new Date().toISOString().slice(0, 10)}.pptx`, compression: true });
        status('PowerPoint gerado. Os textos e as barras podem ser editados no arquivo .pptx.');
      } else {
        printWindow.document.open(); printWindow.document.write(printDocument(slides, image)); printWindow.document.close();
        await printWindow.document.fonts.ready;
        await new Promise((resolve) => setTimeout(resolve, 350));
        if (!printWindow.closed) { printWindow.focus(); printWindow.print(); }
        status('Na janela de impressão, escolha “Salvar como PDF”. Use todas as páginas e desative cabeçalhos e rodapés do navegador.');
      }
    } catch (error) {
      if (printWindow && !printWindow.closed) printWindow.close();
      status(`Falha na exportação: ${error.message || 'tente novamente'}`);
    } finally {
      busy = false; dialog.querySelectorAll('[data-export]').forEach((button) => { button.disabled = false; });
    }
  }
  function mount() {
    dialog = document.createElement('dialog'); dialog.className = 'domestic-report-studio';
    dialog.setAttribute('aria-labelledby', 'domesticStudioTitle');
    dialog.innerHTML = `<header class="dr-studio-header"><div><span>APRESENTAÇÃO TEMÁTICA</span><h2 id="domesticStudioTitle">Dados que orientam. Cuidado que protege.</h2></div><button type="button" data-close aria-label="Fechar editor de relatório">Fechar ×</button></header><div class="dr-studio-layout"><form class="dr-settings"><h3>Personalize o relatório</h3><p class="dr-hint">O conteúdo usa uma cópia dos indicadores do recorte ativo ao abrir este editor.</p><label>Título<input name="title" maxlength="96" value="Violência doméstica e contra a mulher"></label><label>Subtítulo<input name="subtitle" maxlength="100" value="Análise estatística para apresentação"></label><label>Instituição / unidade<input name="unit" maxlength="100" value="Polícia Militar de Alagoas · 10º BPM"></label><label>Responsável<input name="author" maxlength="90" placeholder="Nome, posto ou equipe"></label><label>Análise do responsável<textarea name="notes" maxlength="2400" rows="4" placeholder="Contextualize os resultados e registre pontos de atenção."></textarea></label><label>Encaminhamentos propostos<textarea name="actions" maxlength="1800" rows="3" placeholder="Registre ações propostas, responsáveis e prazos."></textarea></label><fieldset><legend>Seções da apresentação</legend>${sections.map(([key, label]) => `<label class="dr-check"><input name="section" type="checkbox" value="${key}" checked>${label}</label>`).join('')}</fieldset><p class="dr-hint">Capa, qualidade dos dados e fonte sempre acompanham o relatório. Somente estatísticas agregadas são incluídas.</p></form><section class="dr-preview" aria-label="Prévia da apresentação"><div class="dr-export-actions"><button type="button" data-export="pdf">Gerar PDF</button><button type="button" data-export="pptx">Baixar PowerPoint</button></div><p class="dr-export-status" data-status role="status">Revise os slides antes de exportar. PDF horizontal · PowerPoint 16:9 editável.</p><div class="dr-slide" data-slide></div><nav class="dr-slide-nav" aria-label="Navegação dos slides"><button type="button" data-prev aria-label="Slide anterior">←</button><span data-counter aria-live="polite"></span><button type="button" data-next aria-label="Próximo slide">→</button></nav><div class="dr-outline" data-outline aria-label="Roteiro da apresentação"></div></section></div>`;
    document.body.append(dialog);
    dialog.querySelector('form').addEventListener('submit', (event) => event.preventDefault());
    dialog.querySelector('form').addEventListener('input', refresh);
    dialog.addEventListener('click', (event) => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.hasAttribute('data-close')) dialog.close();
      else if (button.hasAttribute('data-prev')) { slideIndex--; refresh(); }
      else if (button.hasAttribute('data-next')) { slideIndex++; refresh(); }
      else if (button.hasAttribute('data-goto')) { slideIndex = Number(button.dataset.goto); refresh(); }
      else if (button.dataset.export) exportReport(button.dataset.export);
    });
  }
  function open(data, canExport) {
    if (!dialog) mount();
    snapshot = JSON.parse(JSON.stringify(data)); snapshot.issued = new Date().toLocaleString('pt-BR');
    authorization = canExport; slideIndex = 0;
    refresh(); status('Revise os slides antes de exportar. PDF horizontal · PowerPoint 16:9 editável.');
    if (!dialog.open) dialog.showModal();
  }
  window.DomesticReport = Object.freeze({ open, buildSlides, toSvg, makePptx, printDocument });
})();
