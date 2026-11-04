import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppBoundary } from './components/ErrorBoundary';
import { flushSave, useStore } from './state/store';
import './styles.css';

// Acceso de solo lectura para pruebas automáticas y depuración desde la consola.
(window as unknown as { __agenda?: typeof useStore }).__agenda = useStore;

// Versión nueva instalada mientras la aplicación estaba abierta: los archivos que se cargan bajo
// demanda (generador de PDF, visor de PDF) ahora son los de la versión nueva, así que conviene
// recargar. La primera instalación no cuenta (no había versión anterior).
if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    void flushSave();
    useStore.getState().setUpdateReady(true);
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root');
createRoot(root).render(
  <StrictMode>
    <AppBoundary>
      <App />
    </AppBoundary>
  </StrictMode>,
);
