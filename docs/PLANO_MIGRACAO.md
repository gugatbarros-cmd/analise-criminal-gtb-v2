# Migração sem interrupção

Consulte [o andamento e os percentuais por fase](STATUS_IMPLEMENTACAO.md). Uma fase é concluída somente depois de verificar todas as entregas previstas.

1. Legado permanece na URL atual, sem alteração do código ou bases.
2. Fase 1 concluída: ambiente local, API, interface e documentação.
3. Fase 2 em andamento: importação sintética, versões, quarentena, backup pré-lote e restauração manual testada; layouts completos pendentes.
4. Fase 3 em andamento: MVI CAD e NEAC separados, CVP e tentativas iniciais; paridade oficial ainda pendente.
5. Fase 4: demais módulos, filtro a filtro, gráfico a gráfico.
6. Fase 5: empacotamento Windows, teste paralelo, plano de corte e reversão.

Só depois de testes de paridade, segurança e backup dos dados atuais será possível propor a troca. A desativação do legado exigirá decisão explícita do responsável.

## Evidências exigidas antes da troca

| Etapa | Evidência verificável | Situação |
| --- | --- | --- |
| Código antigo | Bundle Git `../legacy-v4.6.256-2026-10-22.bundle` e validação do projeto antigo | Bundle criado; legado continua funcional |
| Dados antigos | Exportação de cada base operacional e dos dados locais de cada navegador utilizado, com contagem e SHA-256, guardada fora do repositório | Pendente; bundle de código não contém esses dados |
| Restauração do legado | Abrir as cópias exportadas em ambiente isolado, confirmar contagens e recuperar uma amostra anonimizável | Pendente |
| Seis importadores novos | Conferir cabeçalhos, chaves, erros, retificações e totais em exemplos anonimizados | Pendente de exemplos |
| Paridade de indicadores | Comparar por fonte, ano, município e casos individuais contra totais aprovados do legado | Pendente de referências oficiais |
| Operação paralela | Registrar duas execuções no mesmo período sem desligar a URL antiga; conferir acesso, backup, restauração e limites de desempenho | Pendente |
| Reversão | Manter endereço e dados antigos acessíveis até aprovação expressa do responsável pela troca | Planejado |

O executável local do novo sistema e a prévia web sintética servem para testes. A prévia não recebe dados operacionais. Quando houver dados autorizados, a exportação e o armazenamento devem ocorrer localmente, sem colocar planilhas, bancos, credenciais ou logs pessoais no Git, no Sites ou no Firebase.
