import React from 'react';
import { BranchList } from '../types/ipc';

interface StatusBarProps {
    branches: BranchList | null;
    currentBranch: string | undefined;
    onCheckout: (type: "local" | "remote", name: string) => void;
    isBusy: boolean;
}

export function StatusBar({ branches, currentBranch, onCheckout, isBusy }: StatusBarProps) {
    return (
        <div className="status-bar" style={{
            height: '24px',
            backgroundColor: 'var(--bg-active)', // VS Code generic nice blue/purple
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            padding: '0 8px',
            fontSize: '11px',
            gap: '12px',
            userSelect: 'none'
        }}>
            <div className="status-item" style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <span style={{ fontSize: '10px' }}>⎇</span>
                {/* Branch Selector as a transparent select over the text or just a select styled like text */}
                <select
                    className="branch-select-status"
                    value={branches?.current ? `local::${branches.current}` : ""}
                    disabled={!branches || isBusy}
                    onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const [type, name] = val.split("::");
                        if (type && name) onCheckout(type as any, name);
                    }}
                    style={{
                        background: 'transparent',
                        color: 'inherit',
                        border: 'none',
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: 0,
                        maxWidth: 200,
                        outline: 'none',
                        appearance: 'none', // hide arrow if we want, but arrow is helpful
                        fontWeight: 500
                    }}
                >
                    <option value="" disabled style={{ color: '#000' }}>{branches?.current || "..."}</option>
                    {branches?.locals.map(b => (
                        <option key={`local-${b}`} value={`local::${b}`} style={{ color: '#000' }}>{b}</option>
                    ))}
                    <optgroup label="Remotes" style={{ color: '#000' }}>
                        {branches?.remotes.map(b => (
                            <option key={`remote-${b}`} value={`remote::${b}`} style={{ color: '#000' }}>{b}</option>
                        ))}
                    </optgroup>
                </select>
            </div>

            <div style={{ flex: 1 }} />

            <div style={{ opacity: 0.8 }}>
                {isBusy ? "Working..." : "Ready"}
            </div>
        </div>
    );
}
