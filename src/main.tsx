// Must be first: the Trusted Types policy has to exist before any other module runs.
import '@/app/trustedTypes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { UpdatePrompt } from '@/app/pwa/UpdatePrompt';
import { preventInputZoomOnIOS } from '@/app/viewport';
import { session } from '@/store/sessionStore';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

preventInputZoomOnIOS();
void session.boot();

createRoot(root).render(
  <StrictMode>
    <App>
      <UpdatePrompt />
    </App>
  </StrictMode>,
);
