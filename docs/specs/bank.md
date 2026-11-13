# Banco da cidade

O governo pode aplicar caixa ou tomar empréstimos no painel Banco. Valores são em dólares do jogo; um mês tem 30 dias de simulação.

- Aplicações: prazo de 1 a 12 meses, taxa mensal composta de 0,4% no primeiro mês mais 0,05 ponto percentual por mês adicional. O principal sai do caixa na contratação. Principal e juros são creditados juntos no fechamento do mês de vencimento. Não há resgate antecipado.
- Empréstimos: prazo de 1 a 12 meses, taxa mensal de 1,2% no primeiro mês mais 0,1 ponto percentual por mês adicional. O principal entra no caixa na contratação. A parcela fixa, com juros sobre o saldo devedor, é debitada em cada fechamento; a última quita o saldo remanescente após arredondamento.
- Cada operação tem valor mínimo de $1.000. O saldo principal de empréstimos ativos é limitado a $1.000.000. Pode haver várias operações dentro desse limite. Taxas e totais são mostrados antes de confirmar.
- Apenas juros contam como receita ou despesa no resultado mensal. Principal devolvido por aplicação e principal amortizado são mostrados separadamente no fluxo de caixa. O dinheiro emprestado e a aplicação alteram o saldo imediatamente e não são receita ou custo do mês.
- As parcelas são debitadas do caixa mesmo quando a Prefeitura coleta impostos manualmente; o resgate também vai direto ao caixa. O banco não retém pagamentos por falta de saldo: o caixa pode ficar negativo, como outros custos da cidade.
- Operações e meses restantes são persistidos no salvamento, com inicialização vazia para cidades antigas.
