import RepositoryPicker from "./ui/RepositoryPicker";

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Git Panel</h1>
          <p>Fast changes overview with multi-changelists.</p>
        </div>
      </header>
      <main className="app-main">
        <RepositoryPicker />
      </main>
    </div>
  );
}
