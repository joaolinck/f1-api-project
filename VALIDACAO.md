# Validação da entrega

Verificações executadas em 27/09/2026 com Node.js 24.19.0:

- `npm test`: 15 testes aprovados, nenhuma falha.
- `npm run build`: compilação de produção do React concluída.
- `npm audit --omit=dev --audit-level=high`: nenhuma vulnerabilidade relatada.
- Contrato `openapi.yaml` comparado byte a byte com o arquivo fornecido: idêntico.
- Express iniciado e respondendo em localhost:3000.
- Consulta à Jolpica real, temporada 2024: lista de pilotos, classificação de pilotos, perfil de Lando Norris e resultados da primeira rodada obtidos e validados pelos schemas OpenAPI.
- Ocorreram timeouts reais seguidos de recuperação nas novas tentativas. A consulta de equipes esgotou três tentativas e produziu o HTTP 504 padronizado.

## Limitações da verificação

A inspeção visual e os testes de interação do React em navegador não foram concluídos: o ambiente não tinha Chromium e a instalação não conseguiu baixar um arquivo válido. A compilação do frontend foi verificada; isso não equivale a um teste visual ou end-to-end.

As falhas externas são reproduzidas deterministicamente nos testes. O sucesso das consultas reais não garante a disponibilidade futura da Jolpica, que permanece sujeita a latência e limites de requisição.

O projeto não foi publicado em uma hospedagem; a entrega é executável localmente ou em um servidor Node. Veja o README para instalação, configuração, administrador e limites da implantação em uma única instância.
