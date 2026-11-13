# Log de atualizações na página inicial

- A tela de apresentação e o menu de cidades exibem o mesmo card de atualizações.
- As entradas vivem em `src/app/updates.ts`, em ordem da mais recente para a mais antiga. Cada entrega pública acrescenta data, título e resumo das mudanças visíveis ao jogador.
- A primeira entrada registra o Banco da cidade. O card mostra as notas diretamente, sem exigir login ou abrir outra página.
- O conteúdo é estático no cliente e faz parte da compilação da versão publicada; não depende da API nem do banco de dados.
