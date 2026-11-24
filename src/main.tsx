import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { UpdatePrompt } from '@/app/pwa/UpdatePrompt';
import { session } from '@/store/sessionStore';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

void session.boot();

createRoot(root).render(
  <StrictMode>
    <App>
      <UpdatePrompt />
    </App>
  </StrictMode>,
);
