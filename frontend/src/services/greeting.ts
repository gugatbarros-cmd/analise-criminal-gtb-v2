import { useEffect, useState } from 'react'

export function greetingFor(date: Date): string {
  const hour = date.getHours()
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
}

export function useGreeting() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const update = () => setNow(new Date())
    const timer = window.setInterval(update, 60_000)
    window.addEventListener('focus', update)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update) }
  }, [])
  return {
    greeting: greetingFor(now),
    date: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(now),
  }
}
