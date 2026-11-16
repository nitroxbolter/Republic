# Mundo online

## Objetivo

O Mundo online permite descobrir e visitar cidades de outras contas. O jogador escolhe explicitamente quais cidades quer compartilhar; saves existentes e cidades novas continuam privadas por padrão.

## Compartilhar uma cidade

Na lista de cidades da conta, o dono usa **Compartilhar no mundo**. A ação pode ser desfeita com **Remover do mundo**. Só metadados úteis à descoberta aparecem no catálogo: nome, população, data do jogo, tamanho do mapa, terreno e horário da última atualização. Saldo e identidade da conta não são incluídos.

## Visitar

Cada cidade pública pode ser aberta numa URL `?world=<id>`. O navegador busca o snapshot público e abre o mapa pausado, sem ferramentas de construção, painéis de governo, salvamento ou controles que alterem o save do dono. O visitante pode explorar a cena e voltar ao diretório. A visita mostra a última versão salva pelo proprietário; não é um espelhamento ao vivo da simulação.

## API e privacidade

- `PUT /api/saves/:id/sharing` exige sessão e atualiza apenas uma cidade pertencente à conta autenticada.
- `GET /api/world/cities` lista até 100 cidades públicas, sem saldo ou dados pessoais.
- `GET /api/world/cities/:id` só entrega dados se `is_public` estiver ativo; cidade privada e id inexistente retornam o mesmo 404.
- A migração 7 adiciona `saves.is_public` como `false`, preservando a privacidade de todas as cidades existentes.
- A cidade remota é instanciada como estado local, pausado e somente leitura. Não é conectada a `CitySaver`.

O sistema não implementa ainda visitas simultâneas, chat, presença online ou atualizações em tempo real.
