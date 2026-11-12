# Republica local com contas e XAMPP

1. Abra `Jogar-Republica-PT-Atualizado.exe`. Ele usa o MariaDB instalado em `C:\xampp\mysql` e tenta iniciá-lo se estiver parado. Se a conexão falhar, inicie **MySQL** no painel do XAMPP e abra o executável novamente.
2. O navegador abre em `http://127.0.0.1:18787/`. Crie uma conta com um login de 3 a 24 letras, números ou `_`, e uma senha de pelo menos 8 caracteres digitada duas vezes.
3. Crie ou abra sua cidade. Cada conta pode ter uma cidade; exclua-a na tela inicial para liberar a criação de outra. O jogo salva automaticamente o estado completo no banco `openpolis`, nas tabelas `players`, `player_sessions` e `player_cities`.
4. Mantenha a janela do executável aberta enquanto joga. Para encerrar, pressione `Ctrl+C` nela.

O banco fica na pasta de dados do XAMPP, e não ao lado do executável. Para fazer uma cópia de segurança, exporte o banco `openpolis` pelo phpMyAdmin do XAMPP.

Para usar outra instalação de MySQL ou MariaDB, defina `OPENPOLIS_MYSQL_URL` antes de iniciar o jogo, por exemplo `mysql://usuario:senha@127.0.0.1:3306/openpolis`. Nesse caso, crie previamente o banco e dê ao usuário permissão para criar as tabelas.

O executável serve o jogo apenas em `127.0.0.1`. Cidades salvas pelo executável anterior em uma porta aleatória do navegador continuam armazenadas naquele navegador, mas não são transferidas automaticamente para a nova conta.

A manutenção mensal tem um custo-base e cresce conforme os moradores atendidos. Por mil moradores, hospitais acrescentam 100% do custo-base; polícia e bombeiros, 25%; parques recreativos, 10%. Serviços usam os moradores dentro do alcance; infraestrutura sem alcance de serviço considera a população total da cidade.
