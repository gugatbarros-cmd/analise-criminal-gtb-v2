import { completedPhases, completionPercent, functionalCompletionPercent, implementationStatus, phases, phasePercent, progressMethod, progressUpdatedAt, remainingPercent } from '../progress'

export function ProjectProgress() {
  return <section className="panel project-progress" aria-labelledby="progress-title">
    <div className="section-head"><div><p className="eyebrow">Implantação do novo sistema</p><h2 id="progress-title">Andamento por fase</h2></div><span>Atualizado em {new Date(`${progressUpdatedAt}T12:00:00`).toLocaleDateString('pt-BR')}</span></div>
    <div className="functional-complete">
      <strong>Implementação funcional {functionalCompletionPercent}% concluída</strong>
      <span>{implementationStatus}</span>
    </div>
    <div className="progress-summary"><strong>Validação operacional: {completionPercent}%</strong><span>{remainingPercent}% depende das bases e conferências futuras</span></div>
    <progress value={completionPercent} max="100" aria-label="Conclusão estimada da implantação" />
    <p className="progress-method">{progressMethod}</p>
    <p className="progress-completed"><strong>Fases concluídas:</strong> {completedPhases.length ? completedPhases.map(phase => `Fase ${phase.id} — ${phase.name}`).join('; ') : 'nenhuma'}</p>
    <div className="phase-list">{phases.map(phase => <article key={phase.id}>
      <div className="phase-head"><div><span>Fase {phase.id}</span><h3>{phase.name}</h3></div><strong>{phasePercent(phase)}%</strong></div>
      <div className="phase-track" aria-hidden="true"><span style={{ width: `${phasePercent(phase)}%` }} /></div>
      <p>{phase.completed === phase.total ? 'Concluída' : phase.completed ? 'Em andamento' : 'Pendente'} · {phase.completed}/{phase.total} entregas</p>
      <small><b>Feito:</b> {phase.done}. <b>Falta:</b> {phase.remaining}.</small>
    </article>)}</div>
  </section>
}
