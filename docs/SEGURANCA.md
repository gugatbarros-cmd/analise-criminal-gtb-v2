# Segurança inicial

API e interface vinculadas a loopback. Sem credenciais embutidas, Firebase ou chamada CAD. `.gitignore` exclui bases, planilhas reais, variáveis e logs; as planilhas versionadas em `fixtures/synthetic/` são artificiais. O banco e os arquivos brutos locais ainda não têm autenticação nem criptografia específica: usar apenas dados sintéticos. Não abrir o servidor para a rede antes de definir autenticação e perfis. Publicação web só de agregados aprovados.
