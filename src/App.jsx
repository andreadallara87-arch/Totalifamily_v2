import React, { useState } from 'react';
import { PlusCircle, MinusCircle } from 'lucide-react';
import BottomBar from './components/BottomBar';
import Dashboard from './components/Dashboard';
import TransactionModal from './components/TransactionModal';

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('expense'); // 'expense' o 'income'

  const openModal = (type) => {
    setModalType(type);
    setIsModalOpen(true);
  };

  return (
    <div className="app-wrapper">
      <header style={{ backgroundColor: 'white', padding: '15px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Totalifamily</h1>
        <div className="desktop-only" style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-danger" onClick={() => openModal('expense')}>
            <MinusCircle size={18} /> Nuova Spesa
          </button>
          <button className="btn btn-success" onClick={() => openModal('income')}>
            <PlusCircle size={18} /> Nuova Entrata
          </button>
        </div>
      </header>

      <main className="container">
        <Dashboard />
      </main>

      <BottomBar onOpenExpense={() => openModal('expense')} onOpenIncome={() => openModal('income')} />
      
      {isModalOpen && (
        <TransactionModal 
          type={modalType} 
          onClose={() => setIsModalOpen(false)} 
        />
      )}
    </div>
  );
}

export default App;
