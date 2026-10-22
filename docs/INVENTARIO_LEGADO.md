# Inventário do legado (leitura de código e documentação)

Base observada: `../../../` na versão 4.6.256. Isto é um mapa inicial, não uma prova de paridade.

| Área | Evidência encontrada | Conferência pendente |
| --- | --- | --- |
| Acesso | Login e cadastro no `index.html`; Firebase Authentication, perfis e regras em `firestore.rules` | Matriz de permissões e sessões reais |
| Dados | Bases locais em IndexedDB e compartilhadas em Firestore; importação CSV/XLS/XLSX | Layouts, chaves estáveis e exemplos anonimizados |
| MVI | Abas CAD e NEAC distintas; `docs/METODOLOGIA-MVI.md` descreve exclusões e contagem por vítima | Regras oficiais, casos limite e paridade numérica |
| CVP | Aba própria e `docs/METODOLOGIA-CVP.md` | Regras e totais com fonte oficial |
| Outras análises | Ocorrências, tentativas, violência doméstica, armas, drogas, guarnições, mandados, visitas, TCO, sossego, planejamento | Filtros e cálculos completos por aba |
| Relatórios | Visão executiva, tabela consolidada, relatórios e apresentações, relatório temático | Exportações e diagrama de dependências |
| CAD | Importador local em `scripts/cad-assistente.mjs` e ponte P3 em `assets/js/cad-p3-bridge.mjs` | Documentação/permissão de integração |
| Offline | PWA com `sw.js` e dados locais | Políticas de atualização e recuperação |

As rotas do legado são principalmente abas `data-tab` em `index.html`, não endpoints HTTP. Os filtros e gráficos são implementados no navegador em `assets/js/app.js` e módulos adjacentes. O preparo de índices e caches consta em `docs/ARQUITETURA.md`; medir gargalos exige benchmark com amostras sintéticas equivalentes. Nenhum dado real foi lido para este inventário.

## Checklist de paridade

- [ ] Enumerar filtros, gráficos e exportações de cada aba.
- [ ] Obter layouts anonimizados das seis fontes.
- [ ] Identificar chave de negócio estável por fonte.
- [ ] Registrar casos de teste de contagem de vítimas e ocorrências.
- [ ] Comparar resultados e desempenho com o legado em ambiente isolado.
- [ ] Validar acesso, backup/restauração e operação offline antes da troca.
