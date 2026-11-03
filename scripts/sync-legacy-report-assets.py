"""Copia somente modelos, ilustrações e bibliotecas estáticas autorizadas do legado."""
import shutil
from pathlib import Path

project = Path(__file__).resolve().parents[1]
legacy = Path(__file__).resolve().parents[3]
target = project / 'frontend/public/assets/reports'
target.mkdir(parents=True, exist_ok=True)
for name in ('capa-folder-analise-criminal.png', 'figuras-folder-seguranca-publica.png', 'acolhimento-mulheres.png'):
    shutil.copy2(legacy / 'assets/images/reports' / name, target / name)
for name in ('logo-10bpm-3d-ui.png', 'logo-10bpm-3d-estatistica.png'):
    shutil.copy2(legacy / 'assets/images/logos' / name, target / name)
for name in ('pptxgen.bundle.js', 'pptxgen-LICENSE.txt', 'xlsx.full.min.js'):
    shutil.copy2(legacy / 'vendor' / name, target / name)
shutil.copytree(legacy / 'vendor/leaflet', target / 'leaflet', dirs_exist_ok=True)
shutil.copy2(legacy / 'assets/css/domestic-report.css', target / 'domestic-report.css')
domestic = (legacy / 'assets/js/domestic-report.js').read_text('utf-8')
domestic = domestic.replace("const W = 1600, H = 900;", "const reportBase = document.currentScript.src;\n  const W = 1600, H = 900;")
for name, old in (('acolhimento-mulheres.png', './assets/images/reports/acolhimento-mulheres.png'), ('logo-10bpm-3d-ui.png', './assets/images/logos/logo-10bpm-3d-ui.png'), ('logo-10bpm-3d-estatistica.png', './assets/images/logos/logo-10bpm-3d-estatistica.png')):
    domestic = domestic.replace("'" + old + "'", "new URL('./" + name + "', reportBase).href")
domestic = domestic.replace("'./vendor/pptxgen.bundle.js'", "new URL('./pptxgen.bundle.js', reportBase).href")
domestic = domestic.replace('${format(data.duplicateCount)} linha(s) repetida(s) desconsiderada(s); ', 'Apenas registros correntes processados. Históricos e quarentena são conferidos no sistema local; ')
(target / 'domestic-report.js').write_text(domestic, 'utf-8')
planning = (legacy / 'assets/js/operational-planning.js').read_text('utf-8').replace('analise-criminal-10bpm-operational-plans-v1', 'gtb2-operational-plans-v1')
(target / 'operational-planning.js').write_text(planning, 'utf-8')
shutil.copy2(legacy / 'assets/css/app.css', target / 'planning.css')
html = (legacy / 'index.html').read_text('utf-8')
start = html.index('    <div id="operationalPlanningTab"')
end = html.index('    <div id="folderTab"', start)
body = html[start:end].replace('operational-planning-page" hidden', 'operational-planning-page"')
document = '''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Planejamento operacional · GTB 2.0</title>
<link rel="stylesheet" href="planning.css"><link rel="stylesheet" href="leaflet/leaflet.min.css">
<style>body{margin:0;padding:16px;background:#f3f6fa;font-family:Segoe UI,Arial,sans-serif}#operationalPlanningTab{display:block}#systemToast{display:none}.operational-map{min-height:520px}@media print{@page{size:A4 landscape;margin:8mm}body{padding:0}}</style></head><body><main>''' + body + '''</main><div id="systemToast" role="status"><span></span></div>
<script src="leaflet/leaflet.min.js"></script><script src="operational-planning.js"></script><script>initializeOperationalPlanning();</script></body></html>'''
(target / 'planning.html').write_text(document, 'utf-8')
print('Modelos estáticos do legado copiados; nenhuma base ou conta foi copiada.')
