import React from 'react';
import './ShareModal.css';

interface PaletteModalProps {
  title?: string;
  colors: string[];
  onSelect: (color: string) => void;
  onClose: () => void;
}

const PaletteModal: React.FC<PaletteModalProps> = ({ title = 'Pick a color', colors, onSelect, onClose }) => {
  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="share-modal-header" role="dialog" aria-labelledby="palette-title" aria-modal="true">
          <h2 id="palette-title" className="share-modal-title">
            {title}
          </h2>
          <button onClick={onClose} className="share-modal-close">×</button>
        </div>

        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(36px, 1fr))', gap: '10px' }}>
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => onSelect(color)}
                title={color}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  backgroundColor: color,
                  border: '2px solid var(--border-color)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, border-color 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--primary)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.06)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-color)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaletteModal;


