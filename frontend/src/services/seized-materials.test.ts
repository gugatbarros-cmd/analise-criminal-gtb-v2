import { describe, expect, it } from 'vitest'
import {
  ageDistribution, countBy, depotFor, fetchSeizedMaterials, filterItems, emptyFilters, isoDate, monthlyDeposits, normalizeRows,
  parseCsv, processStage, reportRow, selectForReport, summarizeDepots,
} from './seized-materials'

// Planilha sintética com as mesmas colunas da aba compartilhada, incluindo colunas pessoais fictícias.
const csv = [
  'ID,N° OCORRÊNCIA,DATA OCORRENCIA,CATEGORIA,DESCRIÇÃO,LOCAL DA GUARDA DO MATERIAL,DATA DE DEPÓSITO,ESAJ,STATUS ESAJ,SITUAÇÃO,DATA DEVOLUÇÃO/ DESTRUIÇÃO,OBSERVAÇÕES,PETIÇÃO INTERMEDIÁRIA,QUANT DIAS TOTAL,CIDADE DO FATO,COMARCA,TIPICIDADE GERAL,AUTOR,CPF,RG,TELEFONE,ENDEREÇO DO ENVOLVIDO,PETICIONADOR',
  '1,111,01/01/2025,Aparelho de som,"01 CAIXA DE SOM, COR PRETA",CISP - Palmeira dos Índios,10/01/2025,0700001-00.2025.8.02.0146,ARQUIVADO (03/12/2025),APREENDIDO,,,,,Igaci,Igaci,DANO,FULANO FICTÍCIO,00000000000,0,0,"RUA X, 1",SGT FICTÍCIO',
  '2,222,05/02/2025,Arma Branca,"FACA ""TIPO PEIXEIRA""",Guarda Civil Municipal de Palmeira dos Índios,06/02/2025,0700002-00.2025.8.02.0146,DEVOLVIDO,DEVOLVIDO,16/02/2025,,,10,Palmeira dos Índios,Palmeira dos Índios,PORTE,BELTRANO FICTÍCIO,11111111111,0,0,RUA Y,SGT',
  '3,333,05/03/2025,MAteriais Diversos,"LINHA 1\nLINHA 2",CISP - Maribondo,31/02/2025,,PROTOCOLADO,APREENDIDO,,,,,#N/D,,#N/D,,,,,,',
].join('\n')

describe('materiais apreendidos', () => {
  it('lê CSV com aspas, vírgulas e quebras de linha', () => {
    const rows = parseCsv(csv)
    expect(rows).toHaveLength(4)
    expect(rows[2][4]).toBe('FACA "TIPO PEIXEIRA"')
    expect(rows[3][4]).toBe('LINHA 1\nLINHA 2')
  })

  it('descarta dados pessoais e normaliza depósitos, datas e dias', () => {
    const items = normalizeRows(parseCsv(csv), '2025-03-01')
    const serialized = JSON.stringify(items)
    for (const personal of ['FULANO', 'BELTRANO', '00000000000', '11111111111', 'RUA X', 'SGT']) expect(serialized).not.toContain(personal)
    expect(items[0]).toMatchObject({ depotKey: 'cisp-palmeira', situation: 'apreendido', occurrenceDate: '2025-01-01', days: 50, category: 'Aparelho de som' })
    expect(items[1]).toMatchObject({ depotKey: 'gcm-palmeira', situation: 'devolvido', returnDate: '2025-02-16', days: 10 })
    expect(items[2]).toMatchObject({ depot: 'CISP - Maribondo', depositDate: '', days: null, city: 'Não informado', category: 'Materiais diversos', typification: '' })
  })

  it('recusa planilha sem as colunas esperadas', () => {
    expect(() => normalizeRows([['A', 'B'], ['1', '2']])).toThrow(/coluna/)
  })

  it('reconhece datas válidas e depósitos', () => {
    expect(isoDate('7/3/2025')).toBe('2025-03-07')
    expect(isoDate('31/02/2025')).toBe('')
    expect(depotFor('Guarda Civil Municipal de Palmeira dos Índios').key).toBe('gcm-palmeira')
    expect(depotFor('CISP - Palmeira dos Índios').key).toBe('cisp-palmeira')
    expect(processStage('ARQUIVADO (03/12/2025)')).toBe('ARQUIVADO')
  })

  it('resume depósitos, filtra e seleciona para o relatório', () => {
    const items = normalizeRows(parseCsv(csv), '2025-03-01')
    expect(summarizeDepots(items).map(depot => [depot.key, depot.seized, depot.returned])).toEqual([
      ['cisp-palmeira', 1, 0], ['gcm-palmeira', 0, 1], ['cisp-maribondo', 1, 0],
    ])
    expect(filterItems(items, { ...emptyFilters, search: 'peixeira' }).map(item => item.occurrence)).toEqual(['222'])
    expect(filterItems(items, { ...emptyFilters, situation: 'apreendido', depot: 'cisp-palmeira' })).toHaveLength(1)
    const selected = selectForReport(items, { depots: ['cisp-palmeira', 'gcm-palmeira'], situations: ['devolvido'] })
    expect(selected.map(item => item.occurrence)).toEqual(['222'])
    expect(reportRow(selected[0]).slice(0, 3)).toEqual(['0700002-00.2025.8.02.0146', '05/02/2025', '222'])
  })

  it('monta séries do mini dashboard', () => {
    const items = normalizeRows(parseCsv(csv), '2025-03-01')
    expect(ageDistribution(items).find(band => band.name === 'Até 90 dias')?.total).toBe(1)
    expect(monthlyDeposits(items, 3)).toEqual([{ name: '12/24', total: 0 }, { name: '01/25', total: 1 }, { name: '02/25', total: 1 }])
    expect(countBy(items, item => item.category, 2)).toEqual([{ name: 'Aparelho de som', total: 1 }, { name: 'Demais', total: 2 }])
  })

  it('explica quando a planilha deixa de estar compartilhada', async () => {
    const login = (async () => new Response('<!doctype html><html>login</html>', { status: 200 })) as unknown as typeof fetch
    await expect(fetchSeizedMaterials(login)).rejects.toThrow(/compartilhada/)
    const ok = (async () => new Response(csv, { status: 200 })) as unknown as typeof fetch
    await expect(fetchSeizedMaterials(ok)).resolves.toHaveLength(3)
  })
})

describe('relatório de materiais apreendidos', () => {
  it('agrupa por depósito e escapa o conteúdo da planilha', async () => {
    const { buildSeizedReportHtml } = await import('./seized-report')
    const items = normalizeRows(parseCsv(csv.replace('01 CAIXA DE SOM, COR PRETA', '<script>x</script>')), '2025-03-01')
    const html = buildSeizedReportHtml(items, { scopeLabel: 'Depósitos: todos', author: 'analista', version: 'v0.0.0', readAt: 'agora' })
    expect(html).toContain('Depósito 10º BPM · CISP Palmeira')
    expect(html).toContain('Depósito GCM Palmeira dos Índios')
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(html).not.toContain('<script>x')
    expect(html).not.toContain('FULANO')
  })
})

describe('filtro por comarca', () => {
  it('filtra a relação e limita o relatório às comarcas escolhidas', () => {
    const items = normalizeRows(parseCsv(csv), '2025-03-01')
    expect(filterItems(items, { ...emptyFilters, comarca: 'Igaci' }).map(item => item.occurrence)).toEqual(['111'])
    const all = { depots: ['cisp-palmeira', 'gcm-palmeira', 'cisp-maribondo'], situations: ['apreendido', 'devolvido'] as ('apreendido' | 'devolvido')[] }
    expect(selectForReport(items, all)).toHaveLength(3)
    expect(selectForReport(items, { ...all, comarcas: ['Palmeira dos Índios'] }).map(item => item.occurrence)).toEqual(['222'])
    expect(selectForReport(items, { ...all, comarcas: [] })).toHaveLength(0)
    expect(reportRow(items[0])).toContain('Igaci')
  })
})
