(() => {
  'use strict';

  const STORAGE_KEY = 'gtb2-operational-plans-v1';
  const MUNICIPALITIES = Object.freeze({
    'Palmeira dos Índios': [-9.4057, -36.6328],
    'Belém': [-9.5705, -36.4904],
    "Tanque d'Arca": [-9.5332, -36.4360],
    'Maribondo': [-9.5835, -36.3044],
    'Igaci': [-9.5369, -36.6338],
    'Quebrangulo': [-9.3185, -36.4722],
    'Paulo Jacinto': [-9.3672, -36.3672],
    'Mar Vermelho': [-9.4474, -36.3881],
    'Estrela de Alagoas': [-9.3909, -36.7644],
    'Minador do Negrão': [-9.3123, -36.8696],
    'Cacimbinhas': [-9.4012, -36.9911]
  });
  const UNIT_TYPES = Object.freeze({
    radiopatrulha: { label: 'Radiopatrulha', icon: '🚓', color: '#1764ad', staff: 3 },
    rocam: { label: 'ROCAM', icon: '🏍', color: '#d47b16', staff: 2 },
    'forca-tatica': { label: 'Força Tática', icon: '◆', color: '#7a3eb1', staff: 4 },
    supervisao: { label: 'Supervisão', icon: '★', color: '#0c7a6d', staff: 2 },
    'equipe-pe': { label: 'Equipe a pé', icon: '●', color: '#3b7b3e', staff: 2 },
    apoio: { label: 'Apoio', icon: '+', color: '#64748b', staff: 2 }
  });
  const DEFAULT_UNITS = Object.freeze([
    ['RP 01', 'radiopatrulha'], ['RP 02', 'radiopatrulha'], ['ROCAM 01', 'rocam'],
    ['Força Tática', 'forca-tatica'], ['Supervisão', 'supervisao'], ['Equipe a pé', 'equipe-pe']
  ]);

  const runtime = {
    initialized: false,
    map: null,
    units: [],
    marks: [],
    layers: new Map(),
    selectedId: '',
    pendingUnit: null,
    tool: 'select',
    vertices: [],
    draftLayer: null,
    currentScenarioId: ''
  };
  const el = {};

  function id(prefix = 'op') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function text(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }

  function notify(message) {
    const toast = document.getElementById('systemToast');
    if (!toast) return;
    const content = toast.querySelector('span');
    if (content) content.textContent = message;
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 3600);
  }

  function readPlans() {
    try {
      const plans = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(plans) ? plans : [];
    } catch {
      return [];
    }
  }

  function writePlans(plans) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans.slice(0, 50)));
  }

  function unitIcon(unit, selected = false) {
    const type = UNIT_TYPES[unit.type] || UNIT_TYPES.apoio;
    return L.divIcon({
      className: '',
      iconSize: [42, 42],
      iconAnchor: [21, 21],
      html: `<div class="operation-unit-marker${selected ? ' selected' : ''}" style="--unit-color:${type.color}"><span aria-hidden="true">${type.icon}</span><span class="operation-marker-label">${text(unit.name)}</span></div>`
    });
  }

  function pointIcon() {
    return L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 25], html: '<div class="operation-point-marker"><span>●</span></div>' });
  }

  function renderPalette() {
    el.palette.innerHTML = DEFAULT_UNITS.map(([name, type]) => {
      const model = UNIT_TYPES[type];
      const isPending = runtime.pendingUnit?.name === name && runtime.pendingUnit?.type === type;
      return `<button class="operational-unit-card${isPending ? ' pending' : ''}" type="button" draggable="true" data-name="${text(name)}" data-type="${type}" style="--unit-color:${model.color}"><span class="operational-unit-symbol">${model.icon}</span><span><strong>${text(name)}</strong><small>${model.label} · ${model.staff} policiais</small></span><span>⋮</span></button>`;
    }).join('');
    el.availableCount.textContent = DEFAULT_UNITS.length;
    el.palette.querySelectorAll('.operational-unit-card').forEach((card) => {
      const template = () => ({ name: card.dataset.name, type: card.dataset.type });
      card.addEventListener('click', () => {
        runtime.pendingUnit = template();
        setTool('select');
        renderPalette();
        el.toolHint.textContent = `${runtime.pendingUnit.name} selecionada. Toque no mapa para posicionar.`;
      });
      card.addEventListener('dragstart', (event) => {
        runtime.pendingUnit = template();
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/plain', JSON.stringify(runtime.pendingUnit));
      });
    });
  }

  function addUnit(template, latlng) {
    const model = UNIT_TYPES[template.type] || UNIT_TYPES.apoio;
    const sameType = runtime.units.filter((unit) => unit.type === template.type).length;
    let name = template.name || model.label;
    if (runtime.units.some((unit) => unit.name === name)) name = `${name} ${sameType + 1}`;
    const unit = { id: id('unit'), kind: 'unit', name, type: template.type, staff: model.staff, notes: '', lat: latlng.lat, lng: latlng.lng };
    runtime.units.push(unit);
    runtime.pendingUnit = null;
    renderPalette();
    renderUnit(unit);
    selectItem(unit.id);
    updateSummary();
    el.toolHint.textContent = `${unit.name} posicionada. Arraste o marcador para ajustar.`;
  }

  function renderUnit(unit) {
    const old = runtime.layers.get(unit.id);
    if (old) runtime.map.removeLayer(old);
    const marker = L.marker([unit.lat, unit.lng], { draggable: true, icon: unitIcon(unit, runtime.selectedId === unit.id), riseOnHover: true }).addTo(runtime.map);
    marker.on('click', (event) => { L.DomEvent.stopPropagation(event); selectItem(unit.id); });
    marker.on('dragend', () => {
      const position = marker.getLatLng();
      unit.lat = position.lat;
      unit.lng = position.lng;
      updateSummary();
    });
    marker.bindTooltip(`${text(unit.name)} · ${unit.staff} policiais`, { direction: 'top', offset: [0, -24] });
    runtime.layers.set(unit.id, marker);
  }

  function addPoint(latlng) {
    const mark = { id: id('mark'), kind: 'point', name: `Ponto ${runtime.marks.length + 1}`, notes: '', coordinates: [[latlng.lat, latlng.lng]] };
    runtime.marks.push(mark);
    renderMark(mark);
    selectItem(mark.id);
    updateSummary();
  }

  function finishShape() {
    if ((runtime.tool === 'line' && runtime.vertices.length < 2) || (runtime.tool === 'area' && runtime.vertices.length < 3)) {
      cancelDraft();
      notify(runtime.tool === 'line' ? 'A linha precisa de pelo menos dois pontos.' : 'A área precisa de pelo menos três pontos.');
      return;
    }
    const kind = runtime.tool;
    const label = kind === 'line' ? 'Linha' : 'Área';
    const mark = { id: id('mark'), kind, name: `${label} ${runtime.marks.filter((item) => item.kind === kind).length + 1}`, notes: '', coordinates: runtime.vertices.map((point) => [point.lat, point.lng]) };
    runtime.marks.push(mark);
    cancelDraft();
    renderMark(mark);
    selectItem(mark.id);
    updateSummary();
  }

  function cancelDraft() {
    if (runtime.draftLayer) runtime.map.removeLayer(runtime.draftLayer);
    runtime.draftLayer = null;
    runtime.vertices = [];
  }

  function renderDraft(cursor = null) {
    if (runtime.draftLayer) runtime.map.removeLayer(runtime.draftLayer);
    const points = cursor ? [...runtime.vertices, cursor] : runtime.vertices;
    if (!points.length) return;
    runtime.draftLayer = runtime.tool === 'area'
      ? L.polygon(points, { color: '#e29c1b', weight: 2, dashArray: '6 5', fillOpacity: .12, interactive: false }).addTo(runtime.map)
      : L.polyline(points, { color: '#c52232', weight: 3, dashArray: '7 5', interactive: false }).addTo(runtime.map);
  }

  function renderMark(mark) {
    const old = runtime.layers.get(mark.id);
    if (old) runtime.map.removeLayer(old);
    const points = mark.coordinates.map(([lat, lng]) => [lat, lng]);
    let layer;
    if (mark.kind === 'point') {
      layer = L.marker(points[0], { draggable: true, icon: pointIcon() });
      layer.on('dragend', () => {
        const position = layer.getLatLng();
        mark.coordinates = [[position.lat, position.lng]];
      });
    } else if (mark.kind === 'area') {
      layer = L.polygon(points, { color: runtime.selectedId === mark.id ? '#f4b73d' : '#d4870f', weight: runtime.selectedId === mark.id ? 4 : 3, fillColor: '#f0a51c', fillOpacity: .18 });
    } else {
      layer = L.polyline(points, { color: runtime.selectedId === mark.id ? '#f4b73d' : '#c52232', weight: runtime.selectedId === mark.id ? 5 : 4, dashArray: '10 7' });
    }
    layer.addTo(runtime.map).on('click', (event) => { L.DomEvent.stopPropagation(event); selectItem(mark.id); });
    layer.bindTooltip(text(mark.name), { sticky: true });
    runtime.layers.set(mark.id, layer);
  }

  function findItem(itemId) {
    return runtime.units.find((item) => item.id === itemId) || runtime.marks.find((item) => item.id === itemId) || null;
  }

  function selectItem(itemId) {
    const previous = findItem(runtime.selectedId);
    runtime.selectedId = itemId || '';
    const current = findItem(runtime.selectedId);
    if (previous) previous.kind === 'unit' ? renderUnit(previous) : renderMark(previous);
    if (current && current !== previous) current.kind === 'unit' ? renderUnit(current) : renderMark(current);
    el.inspectorEmpty.hidden = Boolean(current);
    el.inspectorForm.hidden = !current;
    if (!current) return;
    el.selectedId.value = current.id;
    el.selectedName.value = current.name;
    el.selectedNotes.value = current.notes || '';
    const isUnit = current.kind === 'unit';
    el.selectedTypeLabel.hidden = !isUnit;
    el.selectedStaffLabel.hidden = !isUnit;
    if (isUnit) {
      el.selectedType.value = current.type;
      el.selectedStaff.value = current.staff;
    }
  }

  function removeSelected() {
    const item = findItem(runtime.selectedId);
    if (!item) return;
    const layer = runtime.layers.get(item.id);
    if (layer) runtime.map.removeLayer(layer);
    runtime.layers.delete(item.id);
    runtime.units = runtime.units.filter((entry) => entry.id !== item.id);
    runtime.marks = runtime.marks.filter((entry) => entry.id !== item.id);
    selectItem('');
    updateSummary();
  }

  function updateSummary() {
    const staff = runtime.units.reduce((total, unit) => total + (Number(unit.staff) || 0), 0);
    const vehicles = runtime.units.filter((unit) => !['equipe-pe'].includes(unit.type)).length;
    el.unitCount.textContent = runtime.units.length;
    el.staffCount.textContent = staff;
    el.markCount.textContent = runtime.marks.length;
    el.mapTitle.textContent = el.name.value.trim() || 'Operação sem nome';
    el.mapSubtitle.textContent = `${el.municipality.value} · AL`;
    el.summary.innerHTML = `<div><strong>${runtime.units.length}</strong><span>Guarnições</span></div><div><strong>${staff}</strong><span>Policiais</span></div><div><strong>${vehicles}</strong><span>Meios móveis</span></div><div><strong>${runtime.marks.length}</strong><span>Marcações</span></div>`;
  }

  function setTool(tool) {
    cancelDraft();
    runtime.tool = tool;
    if (tool !== 'select') runtime.pendingUnit = null;
    el.tools.forEach((button) => button.classList.toggle('active', button.dataset.operationTool === tool));
    const hints = {
      select: 'Arraste as guarnições para ajustar o posicionamento.',
      point: 'Toque no mapa para adicionar um ponto operacional.',
      line: 'Marque os pontos da linha e dê duplo clique para concluir.',
      area: 'Marque os limites da área e dê duplo clique para concluir.'
    };
    el.toolHint.textContent = hints[tool];
    if (runtime.map) runtime.map.getContainer().style.cursor = tool === 'select' ? '' : 'crosshair';
    renderPalette();
  }

  function serializePlan(planId = runtime.currentScenarioId || id('plan')) {
    const center = runtime.map.getCenter();
    return {
      id: planId,
      name: el.name.value.trim() || 'Operação sem nome',
      municipality: el.municipality.value,
      updatedAt: new Date().toISOString(),
      units: runtime.units.map((unit) => ({ ...unit })),
      marks: runtime.marks.map((mark) => ({ ...mark, coordinates: mark.coordinates.map((pair) => [...pair]) })),
      view: { lat: center.lat, lng: center.lng, zoom: runtime.map.getZoom() }
    };
  }

  function savePlan() {
    const plan = serializePlan();
    const plans = readPlans();
    const existing = plans.findIndex((item) => item.id === plan.id);
    if (existing >= 0) plans[existing] = plan;
    else plans.unshift(plan);
    writePlans(plans);
    runtime.currentScenarioId = plan.id;
    renderScenarioOptions(plan.id);
    notify('Planejamento salvo somente neste navegador.');
  }

  function duplicatePlan() {
    el.name.value = `${el.name.value.trim() || 'Operação'} — cópia`;
    runtime.currentScenarioId = '';
    savePlan();
  }

  function renderScenarioOptions(selectedId = runtime.currentScenarioId) {
    const plans = readPlans().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    el.scenario.innerHTML = '<option value="">Novo planejamento</option>' + plans.map((plan) => `<option value="${text(plan.id)}">${text(plan.name)} · ${text(plan.municipality)}</option>`).join('');
    el.scenario.value = selectedId || '';
  }

  function clearLayers() {
    runtime.layers.forEach((layer) => runtime.map.removeLayer(layer));
    runtime.layers.clear();
    runtime.units = [];
    runtime.marks = [];
    runtime.selectedId = '';
    selectItem('');
    cancelDraft();
  }

  function newPlan(ask = true) {
    if (ask && (runtime.units.length || runtime.marks.length) && !window.confirm('Limpar o tabuleiro atual e iniciar um novo planejamento?')) return;
    clearLayers();
    runtime.currentScenarioId = '';
    el.scenario.value = '';
    el.name.value = 'Operação planejada';
    setTool('select');
    focusMunicipality();
    updateSummary();
  }

  function loadPlan(planId) {
    if (!planId) { newPlan(); return; }
    const plan = readPlans().find((item) => item.id === planId);
    if (!plan) return;
    clearLayers();
    runtime.currentScenarioId = plan.id;
    el.name.value = plan.name || 'Operação planejada';
    el.municipality.value = MUNICIPALITIES[plan.municipality] ? plan.municipality : Object.keys(MUNICIPALITIES)[0];
    runtime.units = Array.isArray(plan.units) ? plan.units : [];
    runtime.marks = Array.isArray(plan.marks) ? plan.marks : [];
    runtime.units.forEach(renderUnit);
    runtime.marks.forEach(renderMark);
    const center = plan.view && Number.isFinite(plan.view.lat) ? [plan.view.lat, plan.view.lng] : MUNICIPALITIES[el.municipality.value];
    runtime.map.setView(center, plan.view?.zoom || 14, { animate: false });
    updateSummary();
    notify(`Planejamento “${plan.name}” carregado.`);
  }

  function focusMunicipality() {
    const center = MUNICIPALITIES[el.municipality.value] || MUNICIPALITIES['Palmeira dos Índios'];
    runtime.map.flyTo(center, 14, { duration: .7 });
    updateSummary();
  }

  function drawCanvasLabel(context, label, x, y, color) {
    context.font = '700 13px Segoe UI, sans-serif';
    const width = context.measureText(label).width + 16;
    context.fillStyle = 'rgba(5,25,45,.88)';
    context.fillRect(Math.max(12, x - width / 2), y + 21, width, 24);
    context.fillStyle = color || '#fff';
    context.fillText(label, Math.max(20, x - width / 2 + 8), y + 38);
  }

  function createOperationalCanvas() {
    const width = 1600;
    const height = 1000;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0a2947');
    gradient.addColorStop(1, '#124f7d');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = 'rgba(174,211,239,.12)';
    context.lineWidth = 1;
    for (let x = 0; x <= width; x += 80) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
    for (let y = 0; y <= height; y += 80) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
    context.fillStyle = 'rgba(4,20,36,.72)';
    context.fillRect(0, 0, width, 115);
    context.fillStyle = '#f2bd4d';
    context.font = '800 18px Segoe UI, sans-serif';
    context.fillText('10º BPM · PLANEJAMENTO OPERACIONAL', 42, 38);
    context.fillStyle = '#fff';
    context.font = '800 34px Segoe UI, sans-serif';
    context.fillText(el.name.value.trim() || 'Operação sem nome', 42, 78);
    context.fillStyle = '#c8dfef';
    context.font = '600 15px Segoe UI, sans-serif';
    context.fillText(`${el.municipality.value} · ${runtime.units.length} guarnições · ${el.staffCount.textContent} policiais`, 1050, 62);
    const mapSize = runtime.map.getSize();
    const scaleX = width / Math.max(1, mapSize.x);
    const scaleY = (height - 155) / Math.max(1, mapSize.y);
    const pointFor = ([lat, lng]) => {
      const point = runtime.map.latLngToContainerPoint([lat, lng]);
      return { x: point.x * scaleX, y: 125 + point.y * scaleY };
    };
    runtime.marks.forEach((mark) => {
      const points = mark.coordinates.map(pointFor);
      if (mark.kind === 'point') {
        context.beginPath(); context.arc(points[0].x, points[0].y, 13, 0, Math.PI * 2); context.fillStyle = '#d62c3e'; context.fill(); context.strokeStyle = '#fff'; context.lineWidth = 4; context.stroke();
      } else {
        context.beginPath(); points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
        if (mark.kind === 'area') { context.closePath(); context.fillStyle = 'rgba(242,174,43,.2)'; context.fill(); context.strokeStyle = '#f2ae2b'; }
        else context.strokeStyle = '#ed5260';
        context.lineWidth = 6; context.stroke();
      }
      if (points[0]) drawCanvasLabel(context, mark.name, points[0].x, points[0].y, '#f6d58f');
    });
    runtime.units.forEach((unit) => {
      const point = pointFor([unit.lat, unit.lng]);
      const type = UNIT_TYPES[unit.type] || UNIT_TYPES.apoio;
      context.beginPath(); context.arc(point.x, point.y, 23, 0, Math.PI * 2); context.fillStyle = type.color; context.fill(); context.strokeStyle = '#fff'; context.lineWidth = 5; context.stroke();
      context.fillStyle = '#fff'; context.font = '900 16px Segoe UI, sans-serif'; context.textAlign = 'center'; context.fillText(type.icon.length <= 2 ? type.icon : '●', point.x, point.y + 6); context.textAlign = 'left';
      drawCanvasLabel(context, `${unit.name} · ${unit.staff}`, point.x, point.y);
    });
    context.fillStyle = 'rgba(3,17,31,.82)'; context.fillRect(0, height - 40, width, 40);
    context.fillStyle = '#b9d3e7'; context.font = '600 13px Segoe UI, sans-serif'; context.fillText('Prancha esquemática — confirme as posições no mapa e nas ordens de serviço oficiais.', 42, height - 15);
    return canvas;
  }

  function safeFileName() {
    return (el.name.value || 'planejamento-operacional').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  }

  function exportImage() {
    createOperationalCanvas().toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${safeFileName()}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      notify('Imagem do planejamento exportada em PNG.');
    }, 'image/png');
  }

  function exportPdf() {
    document.body.classList.add('print-operational-plan');
    const cleanup = () => {
      document.body.classList.remove('print-operational-plan');
      window.setTimeout(() => runtime.map.invalidateSize({ pan: false }), 50);
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    runtime.map.invalidateSize({ pan: false });
    window.setTimeout(() => window.print(), 180);
    notify('Escolha “Salvar como PDF” na janela de impressão.');
  }

  function bindEvents() {
    el.name.addEventListener('input', updateSummary);
    el.municipality.addEventListener('change', focusMunicipality);
    el.scenario.addEventListener('change', () => loadPlan(el.scenario.value));
    el.save.addEventListener('click', savePlan);
    el.duplicate.addEventListener('click', duplicatePlan);
    el.exportButton.addEventListener('click', exportImage);
    el.pdfButton.addEventListener('click', exportPdf);
    el.clear.addEventListener('click', () => newPlan(true));
    el.addUnit.addEventListener('click', () => {
      const name = window.prompt('Identificação da nova guarnição:', 'Apoio 01');
      if (!name?.trim()) return;
      runtime.pendingUnit = { name: name.trim().slice(0, 50), type: 'apoio' };
      setTool('select');
      el.toolHint.textContent = `${runtime.pendingUnit.name} selecionada. Toque no mapa para posicionar.`;
    });
    el.tools.forEach((button) => button.addEventListener('click', () => setTool(button.dataset.operationTool)));
    el.inspectorForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const item = findItem(el.selectedId.value);
      if (!item) return;
      item.name = el.selectedName.value.trim() || item.name;
      item.notes = el.selectedNotes.value.trim();
      if (item.kind === 'unit') {
        item.type = el.selectedType.value;
        item.staff = Math.max(1, Math.min(30, Number(el.selectedStaff.value) || 1));
        renderUnit(item);
      } else renderMark(item);
      updateSummary();
      notify('Item do planejamento atualizado.');
    });
    el.removeSelected.addEventListener('click', removeSelected);
    const container = runtime.map.getContainer();
    container.addEventListener('dragover', (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
    container.addEventListener('drop', (event) => {
      event.preventDefault();
      let template = runtime.pendingUnit;
      try { template = JSON.parse(event.dataTransfer.getData('text/plain')) || template; } catch { /* mantém o item pendente */ }
      if (!template) return;
      const bounds = container.getBoundingClientRect();
      addUnit(template, runtime.map.containerPointToLatLng([event.clientX - bounds.left, event.clientY - bounds.top]));
    });
    runtime.map.on('click', (event) => {
      if (runtime.pendingUnit) { addUnit(runtime.pendingUnit, event.latlng); return; }
      if (runtime.tool === 'point') { addPoint(event.latlng); return; }
      if (runtime.tool === 'line' || runtime.tool === 'area') { runtime.vertices.push(event.latlng); renderDraft(); return; }
      selectItem('');
    });
    runtime.map.on('mousemove', (event) => {
      if (runtime.vertices.length && (runtime.tool === 'line' || runtime.tool === 'area')) renderDraft(event.latlng);
    });
    runtime.map.on('dblclick', (event) => {
      if (runtime.tool === 'line' || runtime.tool === 'area') { L.DomEvent.preventDefault(event); finishShape(); }
    });
  }

  function initializeMap() {
    runtime.map = L.map(el.map, { zoomControl: true, doubleClickZoom: false }).setView(MUNICIPALITIES['Palmeira dos Índios'], 14);
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap', crossOrigin: true });
    const light = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 20, attribution: '&copy; OpenStreetMap &copy; CARTO', crossOrigin: true });
    streets.addTo(runtime.map);
    L.control.layers({ 'Mapa de ruas': streets, 'Tabuleiro claro': light }, null, { position: 'topright' }).addTo(runtime.map);
  }

  function cacheElements() {
    Object.assign(el, {
      map: document.getElementById('operationalMap'), name: document.getElementById('operationName'), municipality: document.getElementById('operationMunicipality'), scenario: document.getElementById('operationScenario'),
      save: document.getElementById('operationSave'), duplicate: document.getElementById('operationDuplicate'), exportButton: document.getElementById('operationExport'), pdfButton: document.getElementById('operationPdf'), clear: document.getElementById('operationClear'),
      palette: document.getElementById('operationUnitPalette'), availableCount: document.getElementById('operationAvailableCount'), addUnit: document.getElementById('operationAddUnit'), tools: [...document.querySelectorAll('[data-operation-tool]')], toolHint: document.getElementById('operationToolHint'),
      unitCount: document.getElementById('operationUnitCount'), staffCount: document.getElementById('operationStaffCount'), markCount: document.getElementById('operationMarkCount'), mapTitle: document.getElementById('operationMapTitle'), mapSubtitle: document.getElementById('operationMapSubtitle'), summary: document.getElementById('operationSummary'),
      inspectorEmpty: document.getElementById('operationInspectorEmpty'), inspectorForm: document.getElementById('operationInspectorForm'), selectedId: document.getElementById('operationSelectedId'), selectedName: document.getElementById('operationSelectedName'), selectedTypeLabel: document.getElementById('operationSelectedTypeLabel'), selectedType: document.getElementById('operationSelectedType'), selectedStaffLabel: document.getElementById('operationSelectedStaffLabel'), selectedStaff: document.getElementById('operationSelectedStaff'), selectedNotes: document.getElementById('operationSelectedNotes'), removeSelected: document.getElementById('operationRemoveSelected')
    });
  }

  window.initializeOperationalPlanning = function initializeOperationalPlanning() {
    if (!runtime.initialized) {
      cacheElements();
      el.municipality.innerHTML = Object.keys(MUNICIPALITIES).map((name) => `<option value="${text(name)}">${text(name)}</option>`).join('');
      renderPalette();
      renderScenarioOptions();
      initializeMap();
      bindEvents();
      updateSummary();
      runtime.initialized = true;
    }
    window.setTimeout(() => runtime.map.invalidateSize({ pan: false }), 100);
  };
})();
