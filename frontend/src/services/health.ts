export type Health = { status: string; version: string; mode: string }

export async function getHealth(baseUrl: string): Promise<Health> {
  const response = await fetch(`${baseUrl}/health`)
  if (!response.ok) throw new Error('A API local não respondeu.')
  return response.json() as Promise<Health>
}
