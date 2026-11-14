import { useState } from "react";
import { csvCell, parseCandidates, type Candidate } from "./csv";

interface CandidateResult extends Candidate {
  result: string;
  holderName?: string;
  issuedByName?: string;
  checkedAt: string;
  verificationId?: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080/api/v1";
const critical = new Set(["REPORTED_LOST", "REVOKED", "NOT_FOUND"]);

export function EmployerDemo() {
  const [apiKey, setApiKey] = useState("");
  const [input, setInput] = useState("documentType,documentNumber\nCERTIFICATE,CERT-2025-0001");
  const [results, setResults] = useState<CandidateResult[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (candidates: Candidate[]) => {
    if (!apiKey.trim()) {
      setError("Enter the institution API key supplied for this demo.");
      return;
    }
    setBusy(true);
    setError("");
    setResults([]);
    try {
      const all: CandidateResult[] = [];
      for (let offset = 0; offset < candidates.length; offset += 50) {
        const batch = candidates.slice(offset, offset + 50);
        const response = await fetch(`${API_BASE}/verify/batch`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": apiKey.trim() },
          body: JSON.stringify({ items: batch })
        });
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({})) as { message?: string; error?: string };
          throw new Error(errorBody.message ?? `API request failed (${response.status} ${errorBody.error ?? ""})`);
        }
        const payload = await response.json() as { results: Array<Omit<CandidateResult, keyof Candidate>> };
        all.push(...payload.results.map((item, index) => ({ ...batch[index]!, ...item })));
      }
      setResults(all);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The verification request failed.");
    } finally {
      setBusy(false);
    }
  };

  const exportResults = () => {
    const columns = ["documentType", "documentNumber", "result", "holderName", "issuedByName", "checkedAt", "verificationId"];
    const data = [
      columns.join(","),
      ...results.map((item) => [
        item.documentType, item.documentNumber, item.result, item.holderName ?? "",
        item.issuedByName ?? "", item.checkedAt, item.verificationId ?? ""
      ].map(csvCell).join(","))
    ].join("\r\n");
    const blob = new Blob([data], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "verification-results.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 1_000_000) {
      setError("CSV file must be smaller than 1 MB.");
      return;
    }
    try {
      setInput(await file.text());
      setError("");
    } catch {
      setError("The selected CSV could not be read.");
    }
  };

  return <main className="app">
    <header className="header"><div><p className="overline">THIRD-PARTY CLIENT DEMO</p><h1>Employer HR</h1></div><span className="api-label">Service Oriente API</span></header>
    <p className="intro">Check candidate credentials through the same documented verification API used by other approved institutions.</p>
    <label className="field">Institution API key
      <input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste your API key" />
      <small>Kept in this tab only. Do not enter a production key on a shared device.</small>
    </label>
    <label className="field">Candidates CSV
      <span className="file-picker"><input type="file" accept=".csv,text/csv" onChange={(event) => void loadFile(event.target.files?.[0])} /></span>
      <small>CSV columns: documentType, documentNumber. Maximum 500 rows (batches of 50).</small>
      <textarea rows={9} value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} />
    </label>
    <div className="actions">
      <button className="primary" disabled={busy} onClick={() => {
        try { void run(parseCandidates(input)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Invalid CSV."); }
      }}>{busy ? "Verifying candidates…" : "Verify candidates"}</button>
      <button disabled={!results.length} onClick={exportResults}>Export results CSV</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {results.some((item) => critical.has(item.result)) && (
      <aside className="alert" role="alert"><strong>Attention required:</strong> One or more candidates have a REPORTED_LOST, REVOKED or NOT_FOUND result. Review before proceeding.</aside>
    )}
    {results.length > 0 && <div className="table-box"><table>
      <thead><tr><th>Candidate document</th><th>Holder</th><th>Issuer</th><th>Result</th><th>Checked</th></tr></thead>
      <tbody>{results.map((item, index) => <tr key={`${item.documentNumber}-${index}`}>
        <td><span>{item.documentType}</span><br />{item.documentNumber}</td>
        <td>{item.holderName ?? "—"}</td><td>{item.issuedByName ?? "—"}</td>
        <td><span className={`status ${item.result.toLowerCase()}`}>{item.result}</span></td>
        <td>{new Date(item.checkedAt).toLocaleString()}</td>
      </tr>)}</tbody>
    </table></div>}
    <footer>Demonstration client only. Use HTTPS and a restricted institution key in production.</footer>
  </main>;
}
