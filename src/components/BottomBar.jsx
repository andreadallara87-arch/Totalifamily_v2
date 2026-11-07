import React from 'react';
import { PlusCircle, MinusCircle, Home } from 'lucide-react';

export default function BottomBar({ onOpenExpense, onOpenIncome }) {
  return (
    <nav className="mobile-only" style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      width: '100%',
      backgroundColor: '#ffffff',
      borderTop: '1px solid #e5e7eb',
      display: 'flex',
      justifyContent: 'space-around',
      padding: '12px 10px',
      boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.05)',
      zIndex: 1000
    }}>
      <button onClick={onOpenExpense} style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
        background: 'none', border: 'none', color: 'var(--danger)', fontWeight: '600', cursor: 'pointer'
      }}>
        <MinusCircle size={24} />
        <span style={{ fontSize: '12px' }}>Spesa</span>
      </button>
      
      <button style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
        background: 'none', border: 'none', color: 'var(--text-muted)', fontWeight: '600', cursor: 'pointer'
      }}>
        <Home size={24} />
        <span style={{ fontSize: '12px' }}>Home</span>
      </button>

      <button onClick={onOpenIncome} style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
        background: 'none', border: 'none', color: 'var(--success)', fontWeight: '600', cursor: 'pointer'
      }}>
        <PlusCircle size={24} />
        <span style={{ fontSize: '12px' }}>Entrata</span>
      </button>
    </nav>
  );
}
