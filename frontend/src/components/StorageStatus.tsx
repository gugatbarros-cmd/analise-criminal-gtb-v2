import { isCloud } from '../services/cloud'

export function StorageStatus() {
  return <section className="panel storage-status"><h2>Firebase e armazenamento</h2>
    <p>Firebase mantido no plano gratuito Spark, sem ativação de faturamento. Ao atingir as cotas, a sincronização fica indisponível e aguarda nova tentativa.</p>
    <p>{isCloud ? 'Esta página consulta uma cópia autenticada dos dados processados. Os arquivos originais e os backups ficam no computador de origem.' : 'O banco principal, contas, arquivos originais e backups permanecem no computador. A sincronização pode ser conectada ou desativada pela administração.'}</p>
  </section>
}
