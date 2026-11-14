import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { isQaPreview } from './qa-preview';
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
        {isQaPreview && (
          <div
            aria-label="Mode QA dengan database terpisah"
            className="pointer-events-none fixed bottom-20 right-2 z-[9999] rounded-full border border-amber-200 bg-amber-400 px-3 py-1 text-[10px] font-extrabold tracking-wide text-slate-950 shadow-lg"
          >
            QA · DATABASE TERPISAH
          </div>
        )}
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
