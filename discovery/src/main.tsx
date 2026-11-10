import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
// One card family and one storefront frame for every page (owner, 8 Nov 2026).
import './components/cards/cards.css';
import './components/storefronts/store.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
