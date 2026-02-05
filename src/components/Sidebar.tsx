import React from 'react';
import { StatusFile } from '../types/ipc';

interface SidebarProps {
    files: StatusFile[];
    selectedPath: string | null;
    onSelectFile: (file: StatusFile) => void;
    repoName: string | undefined;
    children?: React.ReactNode;
}

export function Sidebar({ files, selectedPath, onSelectFile, repoName, children }: SidebarProps) {
    return (
        <div className="app-sidebar">
            <div className="sidebar-header">
                <span>Source Control</span>
            </div>

            {children}

            <div className="sidebar-section" style={{ flex: 1, overflow: 'auto' }}>
                <div className="sidebar-section-title">
                    <span>Changes ({files.length})</span>
                </div>
                <ul className="file-list">
                    {files.map((file) => (
                        <li
                            key={file.path}
                            className={`file-item ${selectedPath === file.path ? 'active' : ''}`}
                            onClick={() => onSelectFile(file)}
                        >
                            <span className={`status-indicator status-${file.status[0].toLowerCase()}`}>
                                {file.status[0]}
                            </span>
                            <span className="file-name" title={file.path}>{file.path}</span>
                        </li>
                    ))}
                </ul>
            </div>

            {!repoName && (
                <div style={{ padding: '20px', fontSize: '12px', color: '#888' }}>
                    No repository open.
                </div>
            )}
        </div>
    );
}
