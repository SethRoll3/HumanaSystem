import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

// Ensure the root element exists
const rootElement = document.getElementById('root');

if (rootElement) {
  try {
    const root = createRoot(rootElement);
    root.render(<App />);
  } catch (error) {
    console.error("Application Mount Error:", error);
    // @ts-ignore
    rootElement.innerHTML = `<div style="padding: 20px; color: red;"><h2>Critical Error</h2><pre>${error.message}</pre></div>`;
  }
} else {
  console.error("Root element not found");
}