import { createStore, Provider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { startPortugueseUi } from './app/i18n/ptBR';
import './styles/tokens.css';
import './styles/app.css';

const store = createStore();
startPortugueseUi();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
