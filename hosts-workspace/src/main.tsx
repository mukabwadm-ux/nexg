import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import { GuestGuidePage } from './pages/GuestGuide';
import './pages/guide.css';
import './styles.css';
import './brand.css';
import './layout.css';
import './overview.css';
import './properties.css';
import './pages/amenities.css';
import './connected.css';
import './platform.css';
import './lively.css';
import './mobile.css';
const guestCode = /^\/q\/([^/]+)\/guide\/?$/.exec(window.location.pathname)?.[1];
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{guestCode ? <GuestGuidePage code={guestCode}/> : <App/>}</React.StrictMode>,
);
