import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useStore } from './state/store';
import './styles.css';

// Acceso de solo lectura para pruebas automáticas y depuración desde la consola.
(window as unknown as { __agenda?: typeof useStore }).__agenda = useStore;

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
