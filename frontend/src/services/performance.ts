/** Marcas locais de desempenho. Não registra parâmetros nem dados operacionais. */
export function timed<T>(name: string, task: () => Promise<T>): Promise<T> {
  const start = performance.now()
  return task().finally(() => {
    performance.measure(`GTB ${name}`, { start, end: performance.now() })
  })
}

export function measure(name: string, start: number): void {
  performance.measure(`GTB ${name}`, { start, end: performance.now() })
}
