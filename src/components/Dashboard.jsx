import React from 'react';

export default function Dashboard() {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        <div className="card">
          <h3 style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '8px' }}>Saldo Mensile</h3>
          <p style={{ fontSize: '28px', fontWeight: 'bold' }}>€ 1.250,00</p>
        </div>
        <div className="card">
          <h3 style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '8px' }}>Uscite</h3>
          <p style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--danger)' }}>€ 850,00</p>
        </div>
      </div>
      
      <div className="card">
        <h2 style={{ fontSize: '18px', marginBottom: '15px' }}>Ultime Transazioni (Mockup Layout)</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '8px' }}>
            <span>Supermercato</span>
            <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>- € 85,00</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '8px' }}>
            <span>Stipendio</span>
            <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>+ € 2.100,00</span>
          </div>
        </div>
      </div>
    </div>
  );
}
