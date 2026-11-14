import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

const queryClient = new QueryClient();
setAuthTokenGetter(() => localStorage.getItem('token'));

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
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
