import React, { useRef, useEffect } from 'react';
import './AIFeaturesModal.css';

interface AIFeaturesModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAnalyzingCanvas: boolean;
  canvasAnalysis: {
    description: string;
    keywords: string[];
    alt_text: string;
  } | null;
  isGeneratingPalette: boolean;
  generatedPalette: string[];
  isGeneratingText: boolean;
  generatedText: {
    titles?: string;
    brief?: string;
    social_media?: string;
  };
  isCreatingSmartGroups: boolean;
  smartGroups: Record<string, string[]>;
  hasAnyAnalysis: boolean;
  onAnalyzeCanvas: () => void;
  onGeneratePalette: () => void;
  onGenerateText: () => void;
  onAutoGroup: () => void;
  selectedIds: string[];
}

const AIFeaturesModal: React.FC<AIFeaturesModalProps> = ({
  isOpen,
  onClose,
  isAnalyzingCanvas,
  canvasAnalysis,
  isGeneratingPalette,
  generatedPalette,
  isGeneratingText,
  generatedText,
  isCreatingSmartGroups,
  smartGroups,
  hasAnyAnalysis,
  onAnalyzeCanvas,
  onGeneratePalette,
  onGenerateText,
  onAutoGroup,
  selectedIds,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      openerRef.current = document.activeElement as HTMLElement | null;
      // Focus first button when modal opens
      setTimeout(() => {
        const firstButton = containerRef.current?.querySelector('button');
        firstButton?.focus();
      }, 0);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleClose = () => {
    onClose();
    // Restore focus to opener
    setTimeout(() => {
      if (openerRef.current?.focus) {
        openerRef.current.focus();
      }
    }, 0);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div className="ai-modal-overlay" onClick={handleClose} />

      {/* Modal */}
      <div
        className="ai-modal-container"
        ref={containerRef}
        role="dialog"
        aria-labelledby="ai-modal-title"
        aria-modal="true"
      >
        {/* Header */}
        <div className="ai-modal-header">
          <div className="ai-modal-title-area">
            <h2 id="ai-modal-title" className="ai-modal-title">
              ✨ AI Features
            </h2>
            {hasAnyAnalysis && <div className="ai-modal-badge">● Analysis Ready</div>}
          </div>
          <button
            className="ai-modal-close"
            onClick={handleClose}
            aria-label="Close AI Features modal"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="ai-modal-content">
          {/* Analyze Canvas Section */}
          <div className="ai-feature-section">
            <div className="ai-feature-header">
              <span className="ai-feature-icon">🤖</span>
              <h3 className="ai-feature-title">Analyze Canvas</h3>
              {isAnalyzingCanvas && <span className="ai-feature-loading">Analyzing...</span>}
            </div>
            <p className="ai-feature-description">
              Get AI-powered insights about your canvas composition and design elements.
            </p>
            {canvasAnalysis && (
              <div className="ai-analysis-result">
                <p className="ai-result-description">{canvasAnalysis.description}</p>
                {canvasAnalysis.keywords.length > 0 && (
                  <div className="ai-keywords">
                    {canvasAnalysis.keywords.map((keyword, idx) => (
                      <span key={idx} className="ai-keyword-tag">
                        {keyword}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              className="ai-action-button ai-action-button--primary"
              onClick={onAnalyzeCanvas}
              disabled={isAnalyzingCanvas}
              title="Analyze Canvas"
            >
              {isAnalyzingCanvas ? (
                <>
                  <span className="ai-spinner" />
                  Analyzing...
                </>
              ) : (
                '🤖 Analyze'
              )}
            </button>
          </div>

          <div className="ai-divider" />

          {/* Color Palette Section */}
          <div className="ai-feature-section">
            <div className="ai-feature-header">
              <span className="ai-feature-icon">🎨</span>
              <h3 className="ai-feature-title">Color Palettes</h3>
              {isGeneratingPalette && <span className="ai-feature-loading">Generating...</span>}
            </div>
            <p className="ai-feature-description">
              Generate beautiful color palettes from your selected elements.
            </p>
            {generatedPalette.length > 0 && (
              <div className="ai-palette-grid">
                {generatedPalette.map((color, idx) => (
                  <div key={idx} className="ai-palette-color">
                    <div
                      className="ai-color-swatch"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                    <span className="ai-color-code">{color}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              className="ai-action-button ai-action-button--primary"
              onClick={onGeneratePalette}
              disabled={isGeneratingPalette || selectedIds.length === 0}
              title={selectedIds.length === 0 ? 'Select an element first' : 'Generate Color Palette'}
            >
              {isGeneratingPalette ? (
                <>
                  <span className="ai-spinner" />
                  Generating...
                </>
              ) : (
                '🎨 Generate Palette'
              )}
            </button>
          </div>

          <div className="ai-divider" />

          {/* Auto-Group Section */}
          <div className="ai-feature-section">
            <div className="ai-feature-header">
              <span className="ai-feature-icon">📦</span>
              <h3 className="ai-feature-title">Auto-Group Elements</h3>
              {isCreatingSmartGroups && <span className="ai-feature-loading">Grouping...</span>}
            </div>
            <p className="ai-feature-description">
              Automatically group similar elements based on size, color, and style.
            </p>
            {Object.keys(smartGroups).length > 0 && (
              <div className="ai-groups-list">
                {Object.entries(smartGroups).map(([groupName, ids]) => (
                  <div key={groupName} className="ai-group-item">
                    <span className="ai-group-name">{groupName}</span>
                    <span className="ai-group-count">{ids.length} items</span>
                  </div>
                ))}
              </div>
            )}
            <button
              className="ai-action-button ai-action-button--primary"
              onClick={onAutoGroup}
              disabled={isCreatingSmartGroups}
              title="Auto-Group Similar Elements"
            >
              {isCreatingSmartGroups ? (
                <>
                  <span className="ai-spinner" />
                  Grouping...
                </>
              ) : (
                '📦 Auto-Group'
              )}
            </button>
          </div>

          <div className="ai-divider" />

          {/* Generate Text Section */}
          <div className="ai-feature-section ai-feature-section--last">
            <div className="ai-feature-header">
              <span className="ai-feature-icon">✍️</span>
              <h3 className="ai-feature-title">Generate Text Content</h3>
              {isGeneratingText && <span className="ai-feature-loading">Generating...</span>}
            </div>
            <p className="ai-feature-description">
              Generate creative text content for your design project.
            </p>
            {Object.keys(generatedText).length > 0 && (
              <div className="ai-text-results">
                {generatedText.titles && (
                  <div className="ai-text-item">
                    <h4 className="ai-text-label">Titles:</h4>
                    <p className="ai-text-content">{generatedText.titles}</p>
                  </div>
                )}
                {generatedText.brief && (
                  <div className="ai-text-item">
                    <h4 className="ai-text-label">Brief:</h4>
                    <p className="ai-text-content">{generatedText.brief}</p>
                  </div>
                )}
                {generatedText.social_media && (
                  <div className="ai-text-item">
                    <h4 className="ai-text-label">Social Media:</h4>
                    <p className="ai-text-content">{generatedText.social_media}</p>
                  </div>
                )}
              </div>
            )}
            <button
              className="ai-action-button ai-action-button--primary"
              onClick={onGenerateText}
              disabled={isGeneratingText}
              title="Generate Text Content"
            >
              {isGeneratingText ? (
                <>
                  <span className="ai-spinner" />
                  Generating...
                </>
              ) : (
                '✍️ Generate Text'
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="ai-modal-footer">
          <button
            className="ai-modal-done-button"
            onClick={handleClose}
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
};

export default AIFeaturesModal;
