import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Stable device candidate ID — generated once, persists in localStorage
if (!localStorage.getItem('relay_candidate')) {
  localStorage.setItem('relay_candidate', crypto.randomUUID());
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
