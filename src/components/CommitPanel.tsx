import React from 'react';
import { CommitPreview } from '../types/ipc';

interface CommitPanelProps {
    message: string;
    onMessageChange: (val: string) => void;
    amend: boolean;
    onAmendChange: (val: boolean) => void;
    onCommit: () => void;
    isBusy: boolean;
    error: string | null;
    preview: CommitPreview | null;
}

export function CommitPanel({
    message,
    onMessageChange,
    amend,
    onAmendChange,
    onCommit,
    isBusy,
    error,
    preview
}: CommitPanelProps) {
    void preview;
    return (
        <div style={{ padding: '10px', borderBottom: '1px solid var(--border-color)' }}>
            <textarea
                className="commit-input"
                placeholder="Message (Ctrl+Enter to commit)"
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.ctrlKey && e.key === 'Enter') {
                        onCommit();
                    }
                }}
                rows={3}
                style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    resize: 'vertical',
                    padding: '8px',
                    fontFamily: 'inherit'
                }}
            />

            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                    className="button"
                    onClick={onCommit}
                    disabled={isBusy || !message.trim()}
                    style={{ flex: 1 }}
                >
                    {isBusy ? 'Committing...' : 'Commit'}
                </button>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <input
                    type="checkbox"
                    checked={amend}
                    onChange={(e) => onAmendChange(e.target.checked)}
                />
                Amend Last Commit
            </label>

            {error && (
                <div style={{ color: '#f14c4c', fontSize: '12px', marginTop: '6px' }}>
                    {error}
                </div>
            )}
        </div>
    );
}
