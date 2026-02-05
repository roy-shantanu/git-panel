import React from 'react';
import { Changelist } from '../types/ipc';

interface ChangelistPanelProps {
    lists: Changelist[];
    activeId: string; // The one currently viewing
    selectedId: string; // The one currently active for commits (wait, selected vs active?)
    // In original: selectedChangelistId is used for filtering files. active_id is the "default" destination?
    // Original logic: active_id is global state. selectedChangelistId is local UI state.
    onSelect: (id: string) => void;
    onSetActive: (id: string) => void;
    onCreate: () => void;
    onRename: (list: Changelist) => void;
    onDelete: (list: Changelist) => void;
    counts: Map<string, number>;
}

export function ChangelistPanel({
    lists,
    activeId, // This is the "system active"
    selectedId, // This is the "viewing"
    onSelect,
    onSetActive,
    onCreate,
    onRename,
    onDelete,
    counts
}: ChangelistPanelProps) {
    return (
        <div className="sidebar-section" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <div className="sidebar-section-title" style={{ justifyContent: 'space-between' }}>
                <span>Changelists</span>
                <button className="button secondary" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={(e) => { e.stopPropagation(); onCreate(); }}>+</button>
            </div>
            <ul className="file-list">
                {lists.map((list) => (
                    <li
                        key={list.id}
                        className={`file-item ${selectedId === list.id ? 'active' : ''}`}
                        onClick={() => onSelect(list.id)}
                        style={{ justifyContent: 'space-between' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                            <span style={{ fontWeight: list.id === activeId ? 'bold' : 'normal' }}>
                                {list.name}
                            </span>
                            {list.id === activeId && <span style={{ fontSize: '10px', opacity: 0.7 }}>(Active)</span>}
                        </div>

                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <span className="count-pill" style={{ fontSize: '10px', padding: '1px 5px' }}>{counts.get(list.id) ?? 0}</span>
                            {/* Only allow deleting non-default lists if needed, or check validity in handler */}
                            {list.name !== "Default" && (
                                <button
                                    className="button secondary"
                                    style={{ padding: '0px 4px', fontSize: '10px', lineHeight: '12px', minWidth: 'auto', height: '16px', display: 'flex', alignItems: 'center' }}
                                    onClick={(e) => { e.stopPropagation(); onDelete(list); }}
                                    title="Delete Changelist"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
