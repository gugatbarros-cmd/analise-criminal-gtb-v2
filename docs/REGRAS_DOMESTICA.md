# Triagem de violência doméstica — versão 0.1.17

Referência somente leitura: `assets/js/domestic-classifier.js` e `docs/regras-indicadores.md` do sistema antigo. A implementação nova usa a base geral de ocorrências e conta cada CAD/BO uma vez por ano. O indicador é provisório; não há paridade comprovada com dados oficiais.

- **Reconhecida:** há marcador de vítima mulher, contexto doméstico/familiar/íntimo e fato afirmativo descrito ou tipificado. Nome próprio isolado não é usado para inferir sexo.
- **Pendente:** menção ou natureza inicial isolada, medida protetiva sem novo fato, perfil insuficiente ou tipificação positiva em conflito com conclusão negativa.
- **Não configurada no atendimento:** conclusão expressa de fato não constatado, improcedência ou ausência de ilicitude, sem evidência positiva conflitante. É o resultado documental do atendimento, não afirmação de denúncia falsa.
- **Fora do recorte feminino:** campo específico aponta vítima masculina e não há marcador conflitante de vítima mulher.
- **Sem relação:** não há indicação do tema nos campos do fato.

Somente reconhecidas entram no cartão e nos rankings. Pendentes, não configuradas e fora do recorte aparecem em listas próprias, com motivo e evidência. As quatro classes podem coexistir com outros indicadores da mesma ocorrência, sem somas automáticas. Revisão humana é necessária antes de qualquer uso operacional ou publicação de resultados reais.

**Limites atuais:** a triagem usa a versão corrente de cada ocorrência; ainda não concilia conclusões conflitantes entre versões históricas. Também faltam campos de conduta específicos, análises de horário/perfil e comparação com uma base oficial anonimizável. Esses itens seguem na Fase 4.
