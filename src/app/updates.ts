/** Add published, player-facing changes here, newest first. Both start screens use this list. */
export interface UpdateEntry {
  readonly date: string;
  readonly title: string;
  readonly changes: readonly string[];
}

export const UPDATES: readonly UpdateEntry[] = [
  {
    date: '2026-11-16',
    title: 'Controles mais leves no celular',
    changes: [
      'A Lia abre pelo ícone e mantém os avisos dentro de um painel que cabe na tela.',
      'Ao desenhar no mapa, uma seta perto da área confirma a obra ou a zona; o custo continua visível.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Banco da cidade',
    changes: [
      'Aplique recursos de 1 a 12 meses e receba juros compostos no vencimento.',
      'Tome empréstimos para financiar obras e subsídios; as parcelas são debitadas a cada fechamento mensal.',
      'O orçamento mostra juros, resgates e amortizações separadamente.',
    ],
  },
];
