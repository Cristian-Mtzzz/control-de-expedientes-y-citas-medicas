import { useEffect } from 'react';

export default function Modal({ title, onClose, wide = false, children }) {
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={'dialog' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="btn ghost sm" onClick={onClose}>Cerrar</button></header>
        {children}
      </div>
    </div>
  );
}

export function Confirmar({ title, children, okLabel, onOk, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="body"><p style={{ margin: 0 }}>{children}</p></div>
      <footer>
        <button className="btn" onClick={onClose}>Volver</button>
        <button className="btn primary" onClick={async () => { await onOk(); onClose(); }}>{okLabel}</button>
      </footer>
    </Modal>
  );
}
