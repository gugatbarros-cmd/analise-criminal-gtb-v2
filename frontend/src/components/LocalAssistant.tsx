import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMunicipalityOverview, type Summary } from '../services/api'

function normalized(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() }

export function LocalAssistant({ summary, year, municipality }: { summary?: Summary; year?: number; municipality?: string }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('Faça uma pergunta sobre indicadores, bases ou municípios.')
  const cities = useQuery({ queryKey: ['assistant-municipalities', year], queryFn: () => getMunicipalityOverview(year) })
  const respond = () => {
    const text = normalized(question)
    if (!summary) { setAnswer('Os indicadores ainda estão carregando. Aguarde e tente novamente.'); return }
    if (/cidade|municipio/.test(text)) {
      const top = cities.data?.[0]
      setAnswer(top ? `${top.municipality} possui o maior volume importado no recorte: ${top.total.toLocaleString('pt-BR')} registros somados por fonte. Isso não representa ocorrências únicas.` : 'Nenhum município possui registros no recorte atual.')
    } else if (/base|fonte|import/.test(text)) {
      setAnswer(`Bases no recorte: CAD ${summary.by_source.mvi_cad}, NEAC ${summary.by_source.mvi_neac}, ocorrências ${summary.by_source.ocorrencias}, armas ${summary.by_source.armas}, drogas ${summary.by_source.drogas} e guarnições ${summary.by_source.guarnicoes}. São contagens independentes.`)
    } else if (/mvi|homicid/.test(text)) {
      setAnswer(`MVI CAD: ${summary.mvi_cad}. MVI NEAC: ${summary.mvi_neac}. As fontes permanecem independentes e possíveis correspondências exigem conferência humana.`)
    } else if (/tco/.test(text)) setAnswer(`TCO: ${summary.tco} no recorte selecionado.`)
    else if (/cvp|patrimonio|roubo/.test(text)) setAnswer(`CVP: ${summary.cvp} no recorte selecionado.`)
    else if (/domestic|mulher/.test(text)) setAnswer(`Violência doméstica reconhecida para revisão: ${summary.domestica} casos no recorte.`)
    else if (/resumo|indicador|situacao|total/.test(text)) setAnswer(`Resumo${year ? ` de ${year}` : ''}${municipality ? ` em ${municipality}` : ''}: MVI CAD ${summary.mvi_cad}, MVI NEAC ${summary.mvi_neac}, CVP ${summary.cvp}, tentativas ${summary.tentativas}, TCO ${summary.tco}, mandados ${summary.mandados}, visitas ${summary.visitas} e sossego ${summary.sossego}.`)
    else setAnswer('Posso responder sobre resumo, bases, municípios, MVI, CVP, TCO e violência doméstica. Não consulto pessoas nem envio informações para serviços externos.')
  }
  return <section className="panel local-assistant"><div className="section-head"><div><p className="eyebrow">Soluções IA · Stiven</p><h2>Assistente analítico local</h2></div><span>Sem envio externo</span></div><p className="muted">Interpreta perguntas guiadas usando somente os agregados já calculados no computador. Não consulta nomes ou ocorrências individuais.</p><div className="assistant-suggestions"><button type="button" onClick={() => setQuestion('Resumo dos indicadores')}>Resumo</button><button type="button" onClick={() => setQuestion('Qual município possui mais registros?')}>Município prioritário</button><button type="button" onClick={() => setQuestion('Quais bases estão disponíveis?')}>Bases disponíveis</button></div><label>Pergunta<textarea value={question} maxLength={300} placeholder="Ex.: qual município possui mais registros?" onChange={event => setQuestion(event.target.value)} /></label><button type="button" className="primary" disabled={!question.trim()} onClick={respond}>Analisar localmente</button><div className="assistant-answer" role="status">{answer}</div></section>
}
