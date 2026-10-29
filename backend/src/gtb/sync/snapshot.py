"""Cópia de consulta consistente; nunca escrita na pasta pública do site."""
import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory

from gtb.db.store import Store
from gtb.ingestion.adapters.normalize import SOURCES


def build_consistent_snapshot(store: Store, version: str) -> dict:
    # Bloquear a origem apenas durante o checkpoint e a cópia. Calcular todos os
    # recortes na cópia mantém o sistema local livre para consultas/importações.
    with TemporaryDirectory(prefix='gtb-online-', dir=store.path.parent) as temporary:
        copy = Path(temporary) / 'snapshot.duckdb'
        with store.lock:
            with store._connect() as db:
                db.execute('CHECKPOINT')
            shutil.copy2(store.path, copy)
        return build_snapshot(Store(copy), version)


def build_snapshot(store: Store, version: str) -> dict:
    # A importação e a exportação compartilham o mesmo bloqueio: sem totais de
    # um lote e tabelas de outro. Limites explícitos evitam truncamento silencioso.
    with store.lock:
        records = {}
        for source in SOURCES:
            first = store.records(source, size=100)
            if first['total'] > 50000:
                raise ValueError('Sincronização indisponível: mais de 50.000 registros em uma fonte.')
            items = first['items']
            for page in range(2, (first['total'] + 99) // 100 + 1):
                items.extend(store.records(source, page=page, size=100)['items'])
            records[source] = items
        years = sorted({item['event_date'].year for rows in records.values() for item in rows})
        cities = sorted({item['municipality'] for rows in records.values() for item in rows
                         if item['municipality']})
        if (len(years) + 2) * (len(cities) + 2) > 400:
            raise ValueError('Sincronização indisponível: recortes excedem o limite desta versão.')
        views = {}
        for year in [None, *years, 1900]:
            for city in [None, *cities, '__sem_resultado__']:
                views[f"{year or '*'}|{(city or '*').lower()}"] = {
                    'summary': store.summary(year, city, bpm_only=True),
                    'tco': store.tco_analysis(year, city),
                    'domestic': store.domestic_analysis(year, city),
                    'arms': store.arms_analysis(year, city),
                    'drugs': store.drugs_analysis(year, city),
                    'teams': store.teams_analysis(year, city),
                    'operations': {kind: store.operational_analysis(kind, year, city)
                                   for kind in ('Mandados', 'Visitas', 'Sossego')},
                    'mvi': {source: store.mvi_analysis(source, year, city)
                            for source in ('mvi_cad', 'mvi_neac')},
                    'mvi_comparison': store.mvi_comparison(year, city),
                }
        evidence = {}
        for indicator in ('Mandados', 'Visitas', 'Sossego', 'Doméstica',
                          'Doméstica:pending', 'Doméstica:excluded', 'Doméstica:outside'):
            first = store.records('ocorrencias', size=100, indicator=indicator)
            items = first['items']
            for page in range(2, (first['total'] + 99) // 100 + 1):
                items.extend(store.records('ocorrencias', page=page, size=100, indicator=indicator)['items'])
            for item in items:
                evidence[f"{indicator}|{item['natural_key']}"] = item['action_evidence']
        details = {'mvi_cad': {}, 'mvi_neac': {}}
        # Uma consulta para todas as versões evita milhares de conexões por lote.
        with store._connect() as db:
            rows = db.execute("""SELECT source,natural_key,version,is_current,valid_from,
                valid_to,batch_id,eligible,category,occurrence,victim,event_date,
                municipality,reason,raw_json FROM record_versions
                WHERE source IN ('mvi_cad','mvi_neac') ORDER BY version DESC""").fetchall()
        for row in rows:
            source, key, ver, current, start, end, batch, eligible, category, occurrence, victim, day, city, reason, raw = row
            entry = details[source].setdefault(key, {'current': None, 'versions': [], 'history': {}})
            entry['versions'].append(dict(version=ver, is_current=current, valid_from=start,
                valid_to=end, batch_id=batch, eligible=eligible, category=category))
            detail = dict(source=source, natural_key=key, version=ver, is_current=current,
                batch_id=batch, eligible=eligible, category=category, occurrence=occurrence,
                victim=victim, event_date=day, municipality=city, reason=reason, fields=json.loads(raw))
            entry['history'][str(ver)] = detail
            if current:
                entry['current'] = detail
        batch_count = store.batch_count()
        if batch_count > 50000:
            raise ValueError('Sincronização indisponível: limite de histórico de importações excedido.')
        batches = [batch for offset in range(0, batch_count, 100)
                   for batch in store.batches(limit=100, offset=offset)]
        # Originais e quarentena ficam locais; a cópia online inclui somente as
        # tabelas processadas, análises, histórico MVI e contagens de importação.
        return dict(version=version, syncedAt=datetime.now(UTC).isoformat(),
            years=years, cities=cities, views=views, records=records, details=details,
            evidence=evidence, batches=batches, audit={}, auditLocalOnly=True)
