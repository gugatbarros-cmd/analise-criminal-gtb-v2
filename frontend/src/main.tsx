import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { getHealth } from './services/health'
import './style.css'

const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

function App() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => getHealth(apiUrl), retry: 1 })
  const status = health.isPending ? 'Verificando API local…' : health.isError ? 'API local indisponível' : 'API local ativa'

  return (
    <main className="shell">
      <header><span className="eyebrow">10º BPM · Ambiente de desenvolvimento</span><span className="badge">Fase 1 · local</span></header>
      <section className="hero">
        <p className="eyebrow">Análise Criminal GTB 2.0</p>
        <h1>Uma nova base para análise criminal.</h1>
        <p>O novo sistema está sendo construído em paralelo. O sistema atual continua disponível enquanto os módulos e indicadores passam por validação.</p>
        <div className="status" role="status"><span className={health.isSuccess ? 'dot active' : 'dot'} />{status}{health.data && ` · versão ${health.data.version}`}</div>
      </section>
      <section className="grid" aria-label="Próximas etapas">
        <article><span>01</span><h2>Importação controlada</h2><p>Fontes separadas, histórico e conferência antes de aplicar dados.</p></article>
        <article><span>02</span><h2>Indicadores auditáveis</h2><p>Regras de MVI documentadas e comparação CAD × NEAC sem soma automática.</p></article>
        <article><span>03</span><h2>Operação segura</h2><p>Execução local primeiro; dados reais e publicação dependem de validação.</p></article>
      </section>
      <footer>Nenhum dado operacional é carregado nesta fase.</footer>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={new QueryClient()}><App /></QueryClientProvider></React.StrictMode>)
