import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import TeleopLab from '@/components/teleop-lab';
import './globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('The app root element is missing.');

createRoot(root).render(
  <StrictMode>
    <TeleopLab />
  </StrictMode>,
);
