import React, { useEffect, useRef } from 'react';

interface PalettePopoverProps {
  anchor: { left: number; top: number } | null;
  colors: string[];
  onSelect: (color: string) => void;
  onClose: () => void;
}

const PalettePopover: React.FC<PalettePopoverProps> = ({ anchor, colors, onSelect, onClose }) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  if (!anchor) return null;

  // Ensure the popover stays within viewport bounds
  const maxWidth = 300;
  const padding = 8;
  const left = Math.min(
    Math.max(padding, anchor.left),
    Math.max(padding, window.innerWidth - maxWidth - padding)
  );
  const top = Math.min(anchor.top, window.innerHeight - 200);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left,
        top,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-lg)',
        padding: 10,
        zIndex: 10001,
        maxWidth,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 36px)', gap: 8 }}>
        {colors.map((color) => (
          <button
            key={color}
            title={color}
            onClick={() => onSelect(color)}
            style={{
              width: 36,
              height: 36,
              backgroundColor: color,
              border: '2px solid var(--border-color)',
              borderRadius: 6,
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
  );
};

export default PalettePopover;


