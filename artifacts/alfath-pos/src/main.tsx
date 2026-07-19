import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

// Auto-reload saat Service Worker versi baru mengambil alih.
// skipWaiting+clientsClaim di workbox langsung aktifkan SW baru,
// tapi tab yang sudah terbuka tetap pakai bundle lama sampai reload.
// controllerchange menandakan SW baru sudah claim tab ini → reload sekali.
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
