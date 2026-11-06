export function publicStreet(street: string): string {
  return street.trim().replace(/(?:,\s*|\s+n[ºo.]?\s+)\d{1,6}\b.*$/i, '')
    .replace(/\s+\d{1,6}(?:[-/]\w+)?$/, '').trim()
}
