import { UPDATES } from '../updates';

export function UpdatesCard({ variant }: { variant: 'landing' | 'menu' }) {
  return <section className={`${variant === 'menu' ? 'panel ' : ''}updates-card is-${variant}`} aria-labelledby={`updates-title-${variant}`}>
    <header className="updates-head">
      <span className="updates-kicker">Diário de desenvolvimento</span>
      <h2 id={`updates-title-${variant}`}>Atualizações</h2>
      <p>Novidades publicadas no jogo, da mais recente para a mais antiga.</p>
    </header>
    <ol className="updates-list">
      {UPDATES.map((entry) => <li key={`${entry.date}-${entry.title}`} className="updates-entry">
        <div className="updates-entry-head"><time dateTime={entry.date}>{new Date(`${entry.date}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</time><h3>{entry.title}</h3></div>
        <ul>{entry.changes.map((change) => <li key={change}>{change}</li>)}</ul>
      </li>)}
    </ol>
  </section>;
}
