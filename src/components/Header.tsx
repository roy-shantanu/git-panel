import React from 'react';
import { WorktreeInfo } from '../types/ipc';
import { useTheme } from './ThemeProvider';

interface HeaderProps {
    repoName: string | undefined;
    worktrees: WorktreeInfo[];
    currentWorktree: string | undefined;
    onSelectWorktree: (path: string) => void;
    onChangeRepo: () => void;
}

export function Header({
    repoName,
    worktrees,
    currentWorktree,
    onSelectWorktree,
    onChangeRepo
}: HeaderProps) {
    const { theme, toggleTheme } = useTheme();
    const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'solarized-light' : 'light';
    return (
        <div className="app-header-bar">
            <div className="breadcrumb">
                <span>{repoName || "Fast Git"}</span>
                {currentWorktree && (
                    <>
                        <span>/</span>
                        <select
                            className="branch-select"
                            style={{
                                background: 'transparent',
                                color: 'inherit',
                                border: 'none',
                                fontSize: '13px',
                                cursor: 'pointer',
                                padding: 0,
                                fontWeight: 600
                            }}
                            value={currentWorktree}
                            onChange={(e) => onSelectWorktree(e.target.value)}
                        >
                            {worktrees.map(wt => (
                                <option key={wt.path} value={wt.path} style={{ color: '#000' }}>
                                    {wt.branch} ({wt.path})
                                </option>
                            ))}
                            {worktrees.length === 0 && Boolean(currentWorktree) && (
                                <option value={currentWorktree}>{currentWorktree}</option>
                            )}
                        </select>
                    </>
                )}
            </div>

            <div style={{ flex: 1 }} />

            <button
                className="button secondary"
                onClick={onChangeRepo}
                title="Change Repository"
                style={{ marginRight: 8 }}
            >
                📂 Open Info
            </button>

            <button
                className="button secondary"
                onClick={toggleTheme}
                title={`Switch to ${nextTheme} theme`}
            >
                {theme === 'light' ? '🌙' : theme === 'dark' ? '☀️' : '🌤️'}
            </button>
        </div>
    );
}
