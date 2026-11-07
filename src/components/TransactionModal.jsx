import React from 'react';
import { X } from 'lucide-react';

export default function TransactionModal({ type, onClose }) {
  const isExpense = type === 'expense';
  
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', zIndex: 2000
    }}>
      <div style={{
        backgroundColor: 'white', width: '100%', maxWidth: '500px',
        borderTopLeftRadius: '20px', borderTopRightRadius: '20px', padding: '24px',
        animation: 'slideUp 0.3s ease-out'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>
            {isExpense ? 'Nuova Spesa' : 'Nuova Entrata'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={(e) => { e.preventDefault(); onClose(); }}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: 'var(--text-muted)' }}>Importo (€)</label>
            <input type="number" step="0.01" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px' }} placeholder="0.00" required />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: 'var(--text-muted)' }}>Categoria</label>
            <select style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', backgroundColor: 'white' }}>
              {isExpense ? (
                <>
                  <option>Alimentari</option>
                  <option>Bollette e Utenze</option>
                  <option>Auto e Trasporti</option>
                  <option>Mutuo</option>
                </>
              ) : (
                <>
                  <option>Stipendio</option>
                  <option>Rimborso</option>
                  <option>Altro</option>
                </>
              )}
            </select>
          </div>
          <button type="submit" className={`btn ${isExpense ? 'btn-danger' : 'btn-success'}`} style={{ width: '100%', justifyContent: 'center', padding: '15px', fontSize: '16px' }}>
            Salva Transazione
          </button>
        </form>
      </div>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
