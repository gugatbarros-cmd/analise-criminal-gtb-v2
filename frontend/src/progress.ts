import data from './project-progress.json'

export type Phase = typeof data.phases[number]
export const phases: Phase[] = data.phases
export const progressUpdatedAt = data.updatedAt
export const progressMethod = data.method

const totalWeight = phases.reduce((sum, phase) => sum + phase.weight, 0)
if (totalWeight !== 100 || phases.some(phase => phase.total <= 0 || phase.completed < 0 || phase.completed > phase.total)) {
  throw new Error('Configuração inválida do andamento do projeto')
}

export const completionPercent = Math.round(phases.reduce(
  (sum, phase) => sum + phase.weight * phase.completed / phase.total, 0,
))
export const remainingPercent = 100 - completionPercent
export const functionalCompletionPercent = 100
export const implementationStatus = data.implementationStatus
export const completedPhases = phases.filter(phase => phase.completed === phase.total)
export function phasePercent(phase: Phase): number {
  return Math.round(100 * phase.completed / phase.total)
}
