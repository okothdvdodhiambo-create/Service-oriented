import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Languages, Moon, ShieldCheck, Sun } from "lucide-react";
import { api, setAuth, verifyPublic, type FullResult } from "./api";
import { ResultCard } from "./components/ResultCard";
import { Scanner } from "./components/Scanner";
import { useToast } from "./components/Toast";

function Shell({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const [dark, setDark] = useState(() => localStorage.getItem("theme") === "dark");
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };
  return (
    <>
      <header className="topbar">
        <Link className="brand" to="/"><ShieldCheck size={24} /> Service Oriente</Link>
        <nav aria-label="Main navigation">
          <Link to="/verify">{t("verify")}</Link>
          <Link to="/login">{t("login")}</Link>
          <button className="icon-button" aria-label="Switch language" onClick={() => void i18n.changeLanguage(i18n.language === "en" ? "sw" : "en")}>
            <Languages size={18} /><span>{i18n.language === "en" ? "SW" : "EN"}</span>
          </button>
          <button className="icon-button" aria-label="Toggle dark mode" onClick={toggleTheme}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        </nav>
      </header>
      <main className="page-content">{children}</main>
      <footer><span>Service Oriente</span><span>{t("trust")}</span></footer>
    </>
  );
}

function Home() {
  const { t } = useTranslation();
  return (
    <div className="container">
      <section className="hero">
        <p className="eyebrow">DOCUMENT VERIFICATION</p>
        <h1>{t("headline")}</h1>
        <p className="lead">{t("intro")}</p>
        <Link className="button primary" to="/verify">{t("verifyNow")} <ArrowRight size={18} /></Link>
      </section>
      <section className="action-grid" aria-label="Document help">
        {[t("lost"), t("found")].map((label) => (
          <button className="action-card" key={label} disabled title={t("comingSoon")}>
            <span>{label}</span><small>{t("comingSoon")}</small>
          </button>
        ))}
      </section>
      <section className="card">
        <h2>{t("verify")}</h2><p>{t("intro")}</p>
        <Link className="button secondary" to="/verify">{t("verifyNow")} <ArrowRight size={18} /></Link>
      </section>
      <section className="card">
        <h2>{t("how")}</h2>
        <ol className="steps"><li>{t("step1")}</li><li>{t("step2")}</li><li>{t("step3")}</li></ol>
      </section>
      <section className="privacy"><h2>{t("trust")}</h2><p>{t("trustText")}</p></section>
    </div>
  );
}

function tokenFromInput(value: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/verify\/q\/([^/]+)\/?$/);
    if (match?.[1]) return decodeURIComponent(match[1]);
  } catch {
    // A raw QR token is also accepted.
  }
  return trimmed;
}

function PublicVerify({ initialToken }: { initialToken?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [tab, setTab] = useState<"scan" | "enter">(initialToken ? "enter" : "scan");
  const [input, setInput] = useState(initialToken ?? "");
  const [cameraDenied, setCameraDenied] = useState(false);
  const [result, setResult] = useState<FullResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const checkToken = useCallback(async (value: string) => {
    const token = tokenFromInput(value);
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const verified = await verifyPublic(token);
      setResult(verified);
      setTab("enter");
    } catch {
      setError(t("serviceError"));
      notify(t("serviceError"));
    } finally {
      setBusy(false);
    }
  }, [notify, t]);
  const scanned = useCallback((value: string) => {
    const token = tokenFromInput(value);
    navigate(`/verify/q/${encodeURIComponent(token)}`);
  }, [navigate]);

  if (busy) return <div className="container"><div className="skeleton" role="status">{t("checking")}</div></div>;
  return (
    <div className="container narrow">
      <h1>{t("verify")}</h1>
      {!result && <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "scan"} onClick={() => setTab("scan")}>{t("scan")}</button>
        <button role="tab" aria-selected={tab === "enter"} onClick={() => setTab("enter")}>{t("enter")}</button>
      </div>}
      {!result && tab === "scan" && <>
        <p>{t("scanHint")}</p><Scanner onScan={scanned} onDenied={() => setCameraDenied(true)} />
        {cameraDenied && <p className="notice" role="status">{t("cameraDenied")}</p>}
      </>}
      {!result && tab === "enter" && <form className="card stack" onSubmit={(event) => { event.preventDefault(); void checkToken(input); }}>
        <label htmlFor="qr-token">{t("inputHint")}</label>
        <textarea id="qr-token" rows={3} value={input} onChange={(event) => setInput(event.target.value)} />
        <button className="button primary" type="submit">{t("verifyNow")}</button>
      </form>}
      {error && <p className="error" role="alert">{error}</p>}
      {result && <ResultCard result={result} onAgain={() => { setResult(null); setInput(""); navigate("/verify"); }} />}
    </div>
  );
}

function PublicQrRoute() {
  const { token = "" } = useParams();
  const [result, setResult] = useState<FullResult | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void verifyPublic(token).then((value) => { if (active) setResult(value); })
      .catch(() => { if (active) setError("Verification is temporarily unavailable. Please try again."); });
    return () => { active = false; };
  }, [token]);
  return <div className="container narrow">
    <h1>Document verification</h1>
    {!result && !error && <div className="skeleton" role="status">Checking document…</div>}
    {error && <p className="error" role="alert">{error}</p>}
    {result && <ResultCard result={result} onAgain={() => window.location.assign("/verify")} />}
  </div>;
}

function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api<{ accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setAuth(response.accessToken);
      navigate("/institution/verify");
    } catch {
      setError("Unable to sign in. Check your credentials or contact your administrator.");
      notify("Unable to sign in. Check your credentials or contact your administrator.");
    } finally {
      setBusy(false);
    }
  };
  return <div className="container narrow"><h1>{t("login")}</h1>
    <form className="card stack" onSubmit={(event) => void submit(event)}>
      <label>{t("email")}<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>{t("password")}<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button className="button primary" disabled={busy}>{busy ? t("checking") : t("signIn")}</button>
      {error && <p className="error" role="alert">{error}</p>}
      <small>Access tokens are kept in memory only and are cleared when this page is closed.</small>
    </form>
  </div>;
}

const documentTypes = [
  { value: "CERTIFICATE", hint: "e.g. CERT-2025-0001" },
  { value: "NATIONAL_ID", hint: "Enter the registered ID number" },
  { value: "LICENSE", hint: "Enter the licence number" }
];

function InstitutionVerify() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [documentType, setDocumentType] = useState(documentTypes[0]!.value);
  const [documentNumber, setDocumentNumber] = useState("");
  const [showNumber, setShowNumber] = useState(false);
  const [result, setResult] = useState<FullResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setResult(await api<FullResult>("/verify/number", {
        method: "POST", body: JSON.stringify({ documentType, documentNumber })
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("serviceError"));
      notify(reason instanceof Error ? reason.message : t("serviceError"));
    } finally {
      setBusy(false);
    }
  };
  return <div className="container narrow">
    <h1>{t("verify")}</h1>
    <div className="institution-nav"><Link to="/institution/history">{t("history")}</Link></div>
    <form className="card stack" onSubmit={(event) => void submit(event)}>
      <label>{t("documentType")}
        <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
          {documentTypes.map((type) => <option key={type.value} value={type.value}>{type.value.replaceAll("_", " ")}</option>)}
        </select>
      </label>
      <label>{t("number")}
        <input required value={documentNumber} type={showNumber ? "text" : "password"} autoComplete="off"
          placeholder={documentTypes.find((type) => type.value === documentType)?.hint}
          onChange={(event) => setDocumentNumber(event.target.value)} />
      </label>
      <label className="inline"><input type="checkbox" checked={showNumber} onChange={(event) => setShowNumber(event.target.checked)} />Show number while typing</label>
      <button className="button primary" disabled={busy}>{busy ? t("checking") : t("submit")}</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {result && <ResultCard result={result} full />}
  </div>;
}

function History() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [resultFilter, setResultFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ page: number; total: number; items: Array<{ id: string; result: string; method: string; documentType: string | null; createdAt: string; maskedNumber: string }> } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (resultFilter) params.set("result", resultFilter);
    if (methodFilter) params.set("method", methodFilter);
    if (from) params.set("from", new Date(`${from}T00:00:00Z`).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59Z`).toISOString());
    void api<typeof data>(`/verify/history?${params}`).then((value) => { if (active) setData(value); })
      .catch(() => {
        if (active) setError("Unable to load verification history.");
        if (active) notify("Unable to load verification history.");
      });
    return () => { active = false; };
  }, [page, resultFilter, methodFilter, from, to, notify]);
  const pages = useMemo(() => Math.max(1, Math.ceil((data?.total ?? 0) / 20)), [data?.total]);
  return <div className="container"><h1>{t("history")}</h1>
    <div className="filter-row">
    <label className="filter">{t("filters")}
      <select value={resultFilter} onChange={(event) => { setPage(1); setResultFilter(event.target.value); }}>
        <option value="">All results</option>
        {["GENUINE", "NOT_FOUND", "REPORTED_LOST", "REVOKED", "REPLACED", "EXPIRED"].map((item) => <option key={item}>{item}</option>)}
      </select>
    </label>
    <label className="filter">Method
      <select value={methodFilter} onChange={(event) => { setPage(1); setMethodFilter(event.target.value); }}>
        <option value="">All methods</option><option value="NUMBER">Number</option><option value="QR">QR</option>
      </select>
    </label>
    <label className="filter">From<input type="date" value={from} onChange={(event) => { setPage(1); setFrom(event.target.value); }} /></label>
    <label className="filter">To<input type="date" value={to} onChange={(event) => { setPage(1); setTo(event.target.value); }} /></label>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="table-wrap"><table><thead><tr><th>Result</th><th>Method</th><th>Document type</th><th>Number</th><th>Checked</th></tr></thead>
      <tbody>{data?.items.map((item) => <tr key={item.id}><td><span className="chip">{item.result}</span></td><td>{item.method}</td><td>{item.documentType ?? "—"}</td><td>{item.maskedNumber}</td><td>{new Date(item.createdAt).toLocaleString()}</td></tr>)}</tbody>
    </table></div>
    <div className="pagination"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>
  </div>;
}

function AppRoutes() {
  return <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/verify" element={<PublicVerify />} />
    <Route path="/verify/q/:token" element={<PublicQrRoute />} />
    <Route path="/login" element={<Login />} />
    <Route path="/institution/verify" element={<InstitutionVerify />} />
    <Route path="/institution/history" element={<History />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}

export function App() {
  return <Shell><AppRoutes /></Shell>;
}
