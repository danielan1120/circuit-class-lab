"use client";

import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, ClipboardCheck, Copy, Download, ExternalLink, FlaskConical, ImagePlus, LayoutGrid, Maximize2, Plus, QrCode, Radio, RefreshCw, ScanLine, SlidersHorizontal, Sparkles, Trash2, Upload, Users, X, Zap } from "lucide-react";
import { getQrDataUrl } from "./lib/qr";
import { getClassBoardPath, getClassLabel, getClassRoom, parseClassNumber } from "@/lib/classrooms";
import { imageSelectionReducer, type ImageSelection, type ImageSelectionAction } from "@/lib/image-selection";
import { readImageFile, readImageDataUrl } from "@/lib/image-file";
import { getApiUrl, getAppPath, getAppUrl, normalizeGraphImage } from "@/lib/client-url";

type Experiment = "voltage" | "resistance";
type Graph = { id: string; room: string; group: number; experiment: Experiment; imageUrl: string; note: string; createdAt: string };
const experiments = {
  voltage: { number: "01", title: "전압과 전류의 관계", short: "전압과 전류", condition: "저항을 일정하게", variable: "전압을 바꾸며 전류를 측정해요.", x: "전압 (V)", y: "전류 (A)", question: "전압을 2배로 높이면, 전류는 어떻게 달라질까요?", tip: "저항을 일정하게 유지한 상태에서 전압을 조금씩 바꾸고 전류의 변화를 관찰해요." },
  resistance: { number: "02", title: "저항과 전류의 관계", short: "저항과 전류", condition: "전압을 일정하게", variable: "저항을 바꾸며 전류를 측정해요.", x: "저항 (Ω)", y: "전류 (A)", question: "저항을 2배로 늘리면, 전류는 어떻게 달라질까요?", tip: "전압을 일정하게 유지한 상태에서 저항을 바꾸고 전류의 변화를 관찰해요." },
};
const groupColors = ["mint", "blue", "purple", "orange", "pink", "olive"];
const maxFileSize = 8 * 1024 * 1024;

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; d?.showModal(); return () => { d?.close(); }; }, []);
  return <dialog ref={ref} className={`modal ${wide ? "modal-wide" : ""}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="닫기" onClick={onClose}><X size={22} /></button></div>{children}
  </dialog>;
}
function CircuitDrawing() {
  return <svg className="circuit-drawing" viewBox="0 0 320 132" fill="none" aria-hidden="true">
    <path d="M33 69V29H116M162 29H286V103H198M149 103H33V69" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M116 29l8-9 10 18 10-18 10 18 8-9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M149 103h14m0-14v28m8-21v14m0-7h27" stroke="currentColor" strokeWidth="2" />
    <circle cx="33" cy="68" r="16" fill="#ecf4ed" stroke="currentColor" strokeWidth="2"/><text x="33" y="73" textAnchor="middle" fill="currentColor" stroke="none" fontSize="13" fontFamily="monospace">A</text>
    <path d="M110 29V65H186V29" stroke="currentColor" strokeWidth="1.5"/><circle cx="149" cy="65" r="14" fill="#ecf4ed" stroke="currentColor" strokeWidth="1.5"/><text x="149" y="70" textAnchor="middle" fill="currentColor" fontSize="13" fontFamily="monospace">V</text>
    <circle cx="245" cy="29" r="4" fill="#a6c7a5"/><path d="M210 42h25m-6-5 6 5-6 5" stroke="#7f9b7e" strokeWidth="1.5"/>
    <text x="112" y="12" fill="#6e8c70" fontSize="11" fontFamily="monospace">R</text><text x="153" y="131" fill="#6e8c70" fontSize="11" fontFamily="monospace">+ −</text>
  </svg>;
}
function EmptyGraph({ exp }: { exp: Experiment }) {
  return <div className="empty-graph"><svg viewBox="0 0 140 72" fill="none" aria-hidden="true"><path d="M28 10v48h88" stroke="#d4ddd6" strokeWidth="1.5"/><path d="M51 18v40m23-40v40m23-40v40M28 39h88M28 20h88" stroke="#e5eae5" strokeDasharray="3 4"/><path d={exp === "voltage" ? "M29 57l79-40" : "M29 15Q40 44 108 54"} stroke="#b2c4b6" strokeWidth="2" strokeDasharray="4 5"/><circle cx="108" cy={exp === "voltage" ? 17 : 54} r="3" fill="#b2c4b6"/></svg><strong>우리 조의 발견을 기다리는 중</strong><span>스마트앱에서 저장한 그래프를 올려주세요.</span></div>;
}

export default function Home() {
  const [experiment, setExperiment] = useState<Experiment>("voltage");
  const [baseRoom, setBaseRoom] = useState("classroom");
  const [classNumber, setClassNumber] = useState(1);
  const [initialized, setInitialized] = useState(false);
  const classLabel = getClassLabel(classNumber);
  const room = getClassRoom(baseRoom, classNumber);
  const [graphs, setGraphs] = useState<Graph[]>([]);
  const [connection, setConnection] = useState<"loading" | "online" | "offline">("loading");
  const [lastSync, setLastSync] = useState("");
  const [uploadGroup, setUploadGroup] = useState<number | null>(null);
  const [qrGroup, setQrGroup] = useState<number | null | undefined>(undefined);
  const [viewGraph, setViewGraph] = useState<Graph | null>(null);
  const [help, setHelp] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [comparing, setComparing] = useState(false);
  const [notice, setNotice] = useState("");
  const [origin, setOrigin] = useState("");
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [confirmNew, setConfirmNew] = useState(false);
  const [imageSelection, dispatchImageSelection] = useReducer(imageSelectionReducer, null);
  const file = imageSelection?.file ?? null;
  const preview = imageSelection?.url ?? "";
  const imageSelectionRef = useRef<ImageSelection | null>(null);
  const imageSelectionId = useRef(0);
  const imageReadController = useRef<AbortController | null>(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const [note, setNote] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const loadSequence = useRef(0);
  const activeRoom = useRef(room);
  activeRoom.current = room;
  const loadingRooms = useRef(new Set<string>());
  const notify = useCallback((message: string) => setNotice(message), []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const roomParam = params.get("room");
    if (roomParam && /^[a-zA-Z0-9_-]{1,48}$/.test(roomParam)) setBaseRoom(roomParam);
    setClassNumber(parseClassNumber(params.get("class")));
    const exp = params.get("exp");
    if (exp === "voltage" || exp === "resistance") setExperiment(exp);
    const group = Number(params.get("group"));
    if (Number.isInteger(group) && group >= 1 && group <= 6 && params.get("upload") === "1") setUploadGroup(group);
    setOrigin(location.origin);
    setInitialized(true);
    try { setTokens(JSON.parse(localStorage.getItem("circuit-delete-tokens") || "{}")); } catch { /* device storage is optional */ }
  }, []);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(""), 4500); return () => clearTimeout(t); }, [notice]);
  useEffect(() => { if (!preview) return; return () => URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { imageReadController.current?.abort(); }, []);
  const loadGraphs = useCallback(async () => {
    if (activeRoom.current !== room || loadingRooms.current.has(room)) return;
    loadingRooms.current.add(room);
    const sequence = ++loadSequence.current;
    try {
      const res = await fetch(getApiUrl(`/api/graphs?room=${encodeURIComponent(room)}`), { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error("연결 실패");
      const data = await res.json() as { graphs: Graph[] };
      if (sequence !== loadSequence.current || activeRoom.current !== room) return;
      setGraphs(data.graphs.map(graph => normalizeGraphImage(graph))); setConnection("online");
      setLastSync(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    } catch { if (sequence === loadSequence.current && activeRoom.current === room) setConnection("offline"); }
    finally { loadingRooms.current.delete(room); }
  }, [room]);
  useEffect(() => { if (!initialized) return; setGraphs([]); setConnection("loading"); loadGraphs(); const timer = setInterval(loadGraphs, 5000); const onVisible = () => { if (!document.hidden) loadGraphs(); }; document.addEventListener("visibilitychange", onVisible); return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); }; }, [initialized, loadGraphs]);
  const currentGraphs = graphs.filter(g => g.room === room && g.experiment === experiment);
  const details = experiments[experiment];
  const boardUrl = getAppUrl(origin, `${getClassBoardPath(baseRoom, classNumber)}&exp=${experiment}`);
  const qrUrl = qrGroup ? `${boardUrl}&group=${qrGroup}&upload=1` : boardUrl;
  const groupUrl = (n: number) => `${boardUrl}&group=${n}&upload=1`;
  function changeExperiment(exp: Experiment) { setExperiment(exp); setSelected([]); history.replaceState(null, "", getAppPath(`${getClassBoardPath(baseRoom, classNumber)}&exp=${exp}`)); }
  function changeClass(n: number) {
    if (n === classNumber) return;
    ++loadSequence.current;
    activeRoom.current = getClassRoom(baseRoom, n);
    setClassNumber(n); setGraphs([]); setSelected([]); setConnection("loading"); setLastSync("");
    setUploadGroup(null); setViewGraph(null); setQrGroup(undefined); setComparing(false); setConfirmNew(false); resetImageSelection(); setNote(""); setUploadError("");
    history.replaceState(null, "", getAppPath(`${getClassBoardPath(baseRoom, n)}&exp=${experiment}`));
  }
  function updateImageSelection(action: ImageSelectionAction) {
    imageSelectionRef.current = imageSelectionReducer(imageSelectionRef.current, action);
    dispatchImageSelection(action);
  }
  function resetImageSelection() {
    ++imageSelectionId.current;
    imageReadController.current?.abort();
    imageReadController.current = null;
    setPreparingImage(false);
    updateImageSelection({ type: "clear" });
  }
  function openUpload(n: number) { resetImageSelection(); setNote(""); setUploadError(""); setUploadGroup(n); }
  function closeUpload() { if (!busy) { setUploadGroup(null); resetImageSelection(); setUploadError(""); } }
  function imageLoaded(id: number, attempt: number) {
    updateImageSelection({ type: "loaded", id, attempt });
  }
  async function imageFailed(id: number, attempt: number) {
    const current = imageSelectionRef.current;
    if (current?.id !== id || current.attempt !== attempt || current.phase !== "preview") return;
    if (current.url.startsWith("blob:")) {
      updateImageSelection({ type: "recover", id, attempt });
      const nextAttempt = attempt + 1;
      const controller = new AbortController();
      imageReadController.current?.abort();
      imageReadController.current = controller;
      try {
        const url = await readImageDataUrl(current.file, controller.signal);
        updateImageSelection({ type: "recovered", id, attempt: nextAttempt, url });
        return;
      } catch {
        if (controller.signal.aborted) return;
      }
      if (imageSelectionRef.current?.id !== id || imageSelectionRef.current.attempt !== nextAttempt) return;
      updateImageSelection({ type: "failed", id, attempt: nextAttempt });
    } else {
      updateImageSelection({ type: "failed", id, attempt });
    }
    setUploadError("파일은 읽었지만 이미지를 표시하지 못했어요. ‘미리보기 다시 읽기’를 누르거나 그래프 화면을 캡처해서 선택해주세요.");
  }
  async function acceptFile(f?: File, input?: HTMLInputElement) {
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) { resetImageSelection(); setUploadError("PNG, JPG, WebP 이미지를 선택해주세요. 스마트앱의 그래프를 캡처해도 좋아요."); return; }
    if (f.size === 0) { resetImageSelection(); setUploadError("빈 파일은 미리 볼 수 없어요. 그래프 이미지를 다시 저장해주세요."); return; }
    if (f.size > maxFileSize) { resetImageSelection(); setUploadError("파일 크기는 8MB 이하여야 해요. 이미지를 캡처하거나 크기를 줄여주세요."); return; }
    resetImageSelection();
    const id = imageSelectionId.current;
    const controller = new AbortController();
    imageReadController.current = controller;
    setPreparingImage(true); setUploadError("");
    try {
      // Read while the Android file picker still owns the input selection.
      // Both preview and upload then use bytes held by this page, not a live provider reference.
      const snapshot = await readImageFile(f, controller.signal);
      if (controller.signal.aborted || imageSelectionId.current !== id) return;
      updateImageSelection({ type: "select", selection: {
        id, file: snapshot, url: URL.createObjectURL(snapshot), loaded: false, attempt: 0, phase: "preview",
      } });
    } catch {
      if (controller.signal.aborted || imageSelectionId.current !== id) return;
      setUploadError("기기에서 파일 내용을 읽지 못했어요. 이미지를 태블릿에 저장한 뒤 ‘내 파일’에서 다시 선택하거나 그래프 화면을 캡처해주세요.");
    } finally {
      if (imageSelectionId.current === id) {
        setPreparingImage(false);
        // Clear only after reading, and never clear an input belonging to a newer selection.
        if (input?.isConnected && input.files?.[0] === f) input.value = "";
      }
    }
  }
  async function uploadGraph() {
    const selection = imageSelectionRef.current;
    if (!selection?.loaded || selection.phase !== "preview" || selection.id !== imageSelection?.id || selection.attempt !== imageSelection.attempt || !uploadGroup || uploadLock.current) return;
    const old = currentGraphs.find(g => g.group === uploadGroup);
    if (old && !window.confirm(`${classLabel} ${uploadGroup}조의 현재 그래프를 새 그래프로 바꿀까요?`)) return;
    uploadLock.current = true; setBusy(true); setUploadError("");
    try {
      const data = new FormData(); data.set("room", room); data.set("group", String(uploadGroup)); data.set("experiment", experiment); data.set("note", note.trim()); data.set("file", selection.file);
      const res = await fetch(getApiUrl("/api/graphs"), { method: "POST", body: data });
      const result = await res.json() as { graph: Graph; deleteToken: string; error?: string };
      if (!res.ok) throw new Error(result.error || "업로드하지 못했어요. 잠시 후 다시 시도해주세요.");
      const nextTokens = { ...tokens, [result.graph.id]: result.deleteToken }; setTokens(nextTokens);
      try { localStorage.setItem("circuit-delete-tokens", JSON.stringify(nextTokens)); } catch { /* uploaded graph remains on the server */ }
      ++loadSequence.current; setGraphs(prev => [...prev.filter(g => !(g.group === uploadGroup && g.experiment === experiment)), normalizeGraphImage(result.graph)]);
      setUploadGroup(null); resetImageSelection(); setConnection("online"); notify(`${classLabel} ${uploadGroup}조 그래프를 공유했어요! 다른 기기에서도 곧 보여요.`);
      await loadGraphs();
    } catch (err) { setUploadError(err instanceof Error ? err.message : "업로드하지 못했어요. 네트워크를 확인해주세요."); }
    finally { setBusy(false); uploadLock.current = false; }
  }
  async function deleteGraph(g: Graph) {
    if (!window.confirm(`${classLabel} ${g.group}조의 이 그래프를 삭제할까요?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(getApiUrl(`/api/graphs?id=${encodeURIComponent(g.id)}&room=${encodeURIComponent(room)}`), { method: "DELETE", headers: { "X-Delete-Token": tokens[g.id] || "" } });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error || "삭제하지 못했어요."); }
      ++loadSequence.current; setGraphs(prev => prev.filter(x => x.id !== g.id)); setViewGraph(null); setSelected(prev => prev.filter(n => n !== g.group)); notify("그래프를 삭제했어요."); await loadGraphs();
    } catch (err) { notify(err instanceof Error ? err.message : "삭제하지 못했어요."); } finally { setDeleting(false); }
  }
  async function copyLink(value: string) {
    try { await navigator.clipboard.writeText(value); notify("링크를 복사했어요."); } catch { window.prompt("아래 링크를 복사해주세요.", value); }
  }
  function newClass() { const id = `class-${crypto.randomUUID().slice(0, 8)}`; ++loadSequence.current; activeRoom.current = getClassRoom(id, classNumber); setBaseRoom(id); setGraphs([]); setSelected([]); history.replaceState(null, "", getAppPath(`${getClassBoardPath(id, classNumber)}&exp=${experiment}`)); setConfirmNew(false); notify("1반~8반의 새 수업을 열었어요. 새 QR코드를 공유해주세요."); }
  function downloadQr() { const a = document.createElement("a"); a.href = getQrDataUrl(qrUrl); a.download = `2학년-${classNumber}반-${qrGroup ? `${qrGroup}조` : "공유보드"}-${experiment}-QR.svg`; a.click(); }
  function compare() { if (currentGraphs.filter(g => selected.includes(g.group)).length < 2) { notify("그래프가 올라온 조를 2개 이상 선택해주세요."); return; } setComparing(true); }

  return <>
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href={boardUrl || "/"}><span className="brand-icon"><Zap size={23} fill="currentColor" /></span><span>우리 반 실험실<small>SCIENCE TOGETHER</small></span></a>
        <div className="sidebar-section-label">CLASSROOM</div>
        <nav aria-label="주 메뉴"><button className="nav-item active" onClick={() => { setHelp(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}><LayoutGrid size={18}/>그래프 공유 보드<span className="nav-dot"/></button><button className="nav-item" onClick={() => setQrGroup(null)}><QrCode size={18}/>QR로 참여하기</button><button className="nav-item" onClick={() => setHelp(true)}><BookOpen size={18}/>실험 & 업로드 안내</button></nav>
        <div className="class-card"><div className="class-card-title"><FlaskConical size={17}/>우리의 탐구 교실</div><p>{classLabel} · 과학</p><div><span><Users size={14}/>6개 조</span><span>조별 4명</span></div><small>함께 실험하는 24명의 과학자</small></div>
        <div className="sidebar-bottom"><div className="little-orbit"><Sparkles size={21}/></div><strong>발견은 나눌수록 커져요.</strong><p>우리 조의 그래프와 친구들의<br/>그래프를 나란히 살펴보세요.</p><span>관찰하고, 비교하고, 발견하기 <ArrowRight size={13}/></span></div>
        <div className="sidebar-footer"><span className="tiny-dot"/>함께 만드는 과학 시간</div>
      </aside>
      <div className="main-shell">
        <header className="topbar"><div className="breadcrumb"><span>우리 반 실험실</span><ChevronRight size={14}/><strong>전기와 자기</strong></div><div className="topbar-right"><span className="subject-pill"><FlaskConical size={13}/>{classLabel}</span><button className="icon-button" aria-label="사용 방법" onClick={() => setHelp(true)}><CircleHelp size={19}/></button></div></header>
        <main>
          <div className="page-heading"><div><div className="eyebrow"><span/>함께 탐구하는 과학</div><h1>전류, 전압, 저항의 관계 탐구하기</h1><p>작은 변화에서 시작하는 발견, 우리 조의 그래프를 공유해요.</p></div><button className="primary-button qr-main" onClick={() => setQrGroup(null)}><QrCode size={18}/>QR로 수업 참여</button></div>
          <section className="class-settings" aria-label="학급 설정">
            <div className="class-settings-copy"><span className="class-settings-icon"><Users size={21}/></span><div><h2>학급 설정</h2><p>반을 선택하면 해당 반의 조별 그래프가 보여요.</p></div></div>
            <div className="class-select-field"><label htmlFor="class-number">반 선택</label><div className="class-select-wrapper"><select id="class-number" value={classNumber} onChange={e => changeClass(Number(e.target.value))}>{[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>2학년 {n}반</option>)}</select><ChevronDown size={17}/></div></div>
          </section>
          <section className="intro-banner" aria-label="탐구 주제"><div className="intro-content"><span className="chapter-label">TODAY’S EXPLORATION <span>01—02</span></span><h2>전압과 저항이 달라지면,<br className="mobile-break"/> 전류는 어떻게 변할까요?</h2><p>센서로 측정하고, 그래프로 비교하며 전기의 규칙을 찾아봐요.</p></div><CircuitDrawing/></section>
          <div className="experiment-tabs" role="tablist" aria-label="실험 선택">{(["voltage", "resistance"] as Experiment[]).map(exp => <button key={exp} role="tab" aria-selected={experiment === exp} className={experiment === exp ? "experiment-tab selected" : "experiment-tab"} onClick={() => changeExperiment(exp)}><span className="experiment-num">실험 {experiments[exp].number}</span><strong>{experiments[exp].title}</strong><ArrowRight size={16}/></button>)}</div>
          <div className="condition-bar"><div><span className="condition-icon"><SlidersHorizontal size={16}/></span><strong>{details.condition}</strong><span className="condition-divider"/><span>{details.variable}</span></div><span className="axis-hint">가로축 {details.x} <span>·</span> 세로축 {details.y}</span></div>
          <section className="board-section" aria-label={`${details.title} 그래프 공유 보드`}>
            <div className="board-heading"><div className="board-title"><h2>{classLabel} 조별 그래프</h2><span className="count-pill">{currentGraphs.length}<span> / 6</span></span><span className={`live-status ${connection}`}><span/>{connection === "online" ? "실시간 공유 중" : connection === "offline" ? "연결 확인 필요" : "연결 중"}</span></div><div className="board-actions"><button className="text-button" onClick={() => setConfirmNew(true)}><Plus size={15}/>새 수업</button><button className="secondary-button compare-button" onClick={compare}><LayoutGrid size={15}/>그래프 비교{selected.length > 0 && <b>{selected.length}</b>}</button></div></div>
            {connection === "offline" && <div className="connection-error" role="alert">공유 서버와 연결하지 못했어요. 기존 화면을 유지하고 있어요.<button onClick={loadGraphs}><RefreshCw size={14}/>다시 연결</button></div>}
            <div className="group-grid">{Array.from({ length: 6 }, (_, i) => {
              const n = i + 1; const g = currentGraphs.find(item => item.group === n);
              return <article className={`group-card ${groupColors[i]} ${selected.includes(n) ? "card-selected" : ""}`} key={n}>
                <div className="card-heading"><div><span className="group-badge">{String(n).padStart(2, "0")}</span><h3>{n}조</h3><span className="group-people"><Users size={12}/>4명</span></div><span className={`upload-status ${g ? "complete" : ""}`}>{g ? <><Check size={11}/>공유 완료</> : "업로드 대기"}</span></div>
                {g ? <button className="graph-thumbnail" onClick={() => setViewGraph(g)} aria-label={`${n}조 그래프 크게 보기`}><img src={g.imageUrl} alt={`${n}조 ${details.title} 실험 그래프`}/><span><Maximize2 size={14}/>크게 보기</span></button> : <EmptyGraph exp={experiment}/>}
                {g?.note && <p className="card-note">{g.note}</p>}
                <div className="card-footer">{g ? <label className="compare-select"><input type="checkbox" checked={selected.includes(n)} onChange={e => setSelected(prev => e.target.checked ? [...prev, n] : prev.filter(x => x !== n))}/><span>비교에 담기</span></label> : <button className="upload-card-button" onClick={() => openUpload(n)}><Plus size={16}/>그래프 올리기</button>}<div className="card-footer-right">{g && <button className="icon-button" title="그래프 다시 올리기" aria-label={`${n}조 그래프 다시 올리기`} onClick={() => openUpload(n)}><Upload size={16}/></button>}<button className="qr-card-button" title={`${n}조 업로드 QR코드`} aria-label={`${n}조 업로드 QR코드`} onClick={() => setQrGroup(n)}><QrCode size={17}/></button></div></div>
              </article>;
            })}</div>
            <div className="board-footnote"><span><Radio size={13}/>{connection === "online" ? `5초마다 자동 반영 · 마지막 확인 ${lastSync}` : "연결되면 모든 조의 결과가 자동으로 반영돼요."}</span><span>PNG, JPG, WebP · 최대 8MB</span></div>
          </section>
          <section className="inquiry-prompt"><span className="inquiry-icon"><Sparkles size={19}/></span><div><span>함께 생각해 보기</span><p>{details.question}</p></div><button className="text-button" onClick={() => setHelp(true)}>탐구 안내<ArrowRight size={15}/></button></section>
          <footer className="main-footer"><span>측정의 차이도 소중한 탐구의 시작이에요.</span><span>우리 반 실험실 <span>·</span> {classLabel}{baseRoom !== "classroom" ? ` · ${baseRoom}` : ""}</span></footer>
        </main>
      </div>
    </div>
    {uploadGroup !== null && <Modal title={`${classLabel} ${uploadGroup}조 · 그래프 올리기`} onClose={closeUpload}>
      <div className="modal-body"><div className="modal-tag">실험 {details.number} · {details.title}</div><p className="modal-description">스마트앱에서 저장한 그래프 이미지나 화면 캡처를 선택해주세요.<br/><strong>이미지 선택은 미리보기예요. 아래 ‘공유하기’를 눌러야 보드에 저장돼요.</strong></p><div className={`upload-drop ${file ? "has-file" : ""}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) acceptFile(e.dataTransfer.files[0]); }}>
        {preparingImage ? <span role="status">기기에서 이미지 파일을 읽는 중…</span> : imageSelection ? <>
          {imageSelection.phase === "preview" && <img key={`${imageSelection.id}:${imageSelection.attempt}`} src={imageSelection.url} alt="올릴 그래프 미리보기" onLoad={() => imageLoaded(imageSelection.id, imageSelection.attempt)} onError={() => imageFailed(imageSelection.id, imageSelection.attempt)}/>}
          {imageSelection.phase === "recovering" ? <span role="status">다른 방식으로 미리보기를 다시 읽는 중…</span> : imageSelection.phase === "failed" ? <button className="secondary-button" onClick={() => acceptFile(imageSelection.file)}>미리보기 다시 읽기</button> : !imageSelection.loaded && <span role="status">이미지 미리보기를 불러오는 중…</span>}
        </> : <><span className="upload-round"><ImagePlus size={30}/></span><strong>그래프 이미지를 여기에 놓아주세요</strong><span>또는 버튼을 눌러 파일을 선택해요.</span></>}
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={e => { void acceptFile(e.currentTarget.files?.[0], e.currentTarget); }}/><button className="secondary-button" disabled={busy} onClick={() => fileInput.current?.click()}>{file || preparingImage ? "다른 이미지 선택" : "이미지 선택"}</button>{file && <small>{file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB</small>}
      </div><label className="form-label" htmlFor="graph-note">우리 조의 관찰 <span>선택</span></label><textarea id="graph-note" value={note} maxLength={500} disabled={busy} onChange={e => setNote(e.target.value)} placeholder="예: 전압을 높이니 전류도 커졌어요." rows={3}/><div className="character-count">{note.length} / 500</div>{uploadError && <div className="form-error" role="alert">{uploadError}</div>}<p className="privacy-note">그래프만 올려주세요. 이름이나 얼굴은 넣지 않아요.<br/>이미 올라온 그래프가 있으면 새 이미지로 바뀌어요.</p></div>
      <div className="modal-footer"><button className="secondary-button" disabled={busy} onClick={closeUpload}>취소</button><button className="primary-button" disabled={!imageSelection?.loaded || busy} onClick={uploadGraph}>{busy ? <RefreshCw className="spin" size={17}/> : <Upload size={17}/>} {busy ? "공유하는 중…" : `${classLabel} ${uploadGroup}조 공유하기`}</button></div>
    </Modal>}
    {qrGroup !== undefined && <Modal title={`${classLabel} · QR로 참여해요`} onClose={() => setQrGroup(undefined)}>
      <div className="modal-body qr-body"><p className="modal-description">휴대폰 카메라로 QR코드를 비추면 바로 참여할 수 있어요.</p><label className="qr-select-label" htmlFor="qr-group">접속할 화면</label><div className="select-wrapper"><select id="qr-group" value={qrGroup ?? "board"} onChange={e => setQrGroup(e.target.value === "board" ? null : Number(e.target.value))}><option value="board">{classLabel} 전체 공유 보드</option>{[1,2,3,4,5,6].map(n => <option value={n} key={n}>{classLabel} {n}조 · {details.title} 업로드</option>)}</select><ChevronDown size={17}/></div><div className="qr-frame">{origin && <img src={getQrDataUrl(qrUrl)} alt={qrGroup ? `${classLabel} ${qrGroup}조 업로드 화면 QR코드` : `${classLabel} 공유 보드 QR코드`}/>}</div><strong className="qr-caption">{qrGroup ? `${classLabel} ${qrGroup}조의 그래프를 올려주세요` : `${classLabel}의 발견을 함께 나눠요`}</strong><p className="qr-subcaption">{qrGroup ? `실험 ${details.number} · ${details.title}` : "조별 업로드 · 그래프 비교 · 로그인 없이 참여"}</p><button className="link-copy-box" onClick={() => copyLink(qrUrl)}><span>{qrUrl}</span><Copy size={16}/></button><div className="qr-tools"><button className="secondary-button" onClick={downloadQr}><Download size={16}/>QR 저장</button><button className="secondary-button" onClick={() => { setQrGroup(undefined); setTimeout(() => window.print(), 50); }}><QrCode size={16}/>6개 조 QR 인쇄</button></div></div>
    </Modal>}
    {viewGraph && <Modal wide title={`${classLabel} ${viewGraph.group}조 · ${experiments[viewGraph.experiment].title}`} onClose={() => setViewGraph(null)}><div className="modal-body"><div className="full-graph"><img src={viewGraph.imageUrl} alt={`${viewGraph.group}조 실험 그래프`}/></div>{viewGraph.note && <div className="observation"><strong>우리 조의 관찰</strong><p>{viewGraph.note}</p></div>}<div className="graph-meta">공유한 시간 · {new Date(viewGraph.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</div></div><div className="modal-footer">{tokens[viewGraph.id] && <button className="danger-button" disabled={deleting} onClick={() => deleteGraph(viewGraph)}><Trash2 size={15}/>{deleting ? "삭제 중…" : "삭제"}</button>}<a href={`${viewGraph.imageUrl}?download=1`} download={`실험-${viewGraph.experiment}-${viewGraph.group}조.png`} className="secondary-button"><ArrowDownToLine size={16}/>이미지 다운로드</a><button className="primary-button" onClick={() => setViewGraph(null)}>확인</button></div></Modal>}
    {comparing && <Modal wide title={`${classLabel} · 실험 ${details.number} 그래프 비교`} onClose={() => setComparing(false)}><div className="modal-body"><div className="compare-condition"><SlidersHorizontal size={17}/>{details.condition} · {details.variable}</div><div className="comparison-grid">{currentGraphs.filter(g => selected.includes(g.group)).map(g => <div className={`comparison-item ${groupColors[g.group - 1]}`} key={g.id}><h3><span className="group-badge">{String(g.group).padStart(2,"0")}</span>{g.group}조</h3><img src={g.imageUrl} alt={`${g.group}조 그래프`}/>{g.note && <p>{g.note}</p>}</div>)}</div><div className="compare-question"><Sparkles size={18}/><p>그래프의 모양과 축의 범위를 비교해보세요.<br/><strong>비슷한 점과 다른 점은 무엇인가요?</strong></p></div></div></Modal>}
    {help && <Modal title="측정에서 공유까지, 함께해요" onClose={() => setHelp(false)}><div className="modal-body"><div className="help-steps">{[{icon:Activity,title:"센서로 측정해요",text:"디지털 전압·전류 센서를 연결하고 스마트앱에서 실험 그래프를 확인해요."},{icon:ImagePlus,title:"그래프를 이미지로 저장해요",text:"스마트앱의 이미지 내보내기를 이용하거나, 축과 단위가 보이게 화면을 캡처해요."},{icon:QrCode,title:"우리 조 QR로 올려요",text:"상단에서 반을 선택하거나 QR코드를 스캔하고 반·실험·조 번호를 확인한 뒤 이미지를 올려요. 센서 앱과의 직접 연동 없이 사용할 수 있어요."},{icon:LayoutGrid,title:"친구들의 결과와 비교해요",text:"다른 기기의 보드에도 약 5초 안에 반영돼요. 두 개 이상의 조를 ‘비교에 담기’로 선택해 나란히 보세요."}].map((s,i) => <div className="help-step" key={s.title}><span className="step-icon"><s.icon size={21}/></span><div><small>STEP {String(i+1).padStart(2,"0")}</small><strong>{s.title}</strong><p>{s.text}</p></div></div>)}</div><div className="help-tip"><strong>실험에서 기억해요</strong><p>{details.tip}</p><p>저항을 바꿀 때는 전원을 끄고, 전압계는 병렬·전류계는 직렬로 연결해요. 선생님의 안내에 따라 실험해요.</p></div><p className="privacy-note">‘새 수업’을 누르면 1반~8반 전체에 별도 보드와 QR코드가 만들어져요. 이전 수업은 이전 링크에서 계속 볼 수 있어요.</p></div><div className="modal-footer"><button className="primary-button" onClick={() => setHelp(false)}><Check size={17}/>준비됐어요</button></div></Modal>}
    {confirmNew && <Modal title="1반~8반의 새 수업을 시작할까요?" onClose={() => setConfirmNew(false)}><div className="modal-body"><p className="modal-description">1반부터 8반까지 각 반의 1조~6조가 올릴 빈 보드와 새 참여 링크를 만들어요. 기존 반별 결과는 이전 링크에 남아 있어요.</p><button className="link-copy-box" onClick={() => copyLink(boardUrl)}><span>현재 수업 링크 복사</span><Copy size={16}/></button><p className="privacy-note">새 수업을 만든 후에는 새 QR코드를 공유해주세요.</p></div><div className="modal-footer"><button className="secondary-button" onClick={() => setConfirmNew(false)}>취소</button><button className="primary-button" onClick={newClass}><Plus size={16}/>새 수업 만들기</button></div></Modal>}
    {notice && <div className="toast" role="status"><CheckCheck size={18}/>{notice}<button aria-label="알림 닫기" onClick={() => setNotice("")}><X size={15}/></button></div>}
    <div className="print-sheet"><h1>전류, 전압, 저항의 관계 탐구하기</h1><p>{classLabel} · 실험 {details.number} · {details.title} / QR코드를 스캔하고 우리 조의 그래프를 올려주세요.</p><div className="print-grid">{[1,2,3,4,5,6].map(n => <div key={n}><h2>{classLabel} {n}조</h2>{origin && <img src={getQrDataUrl(groupUrl(n))} alt={`${n}조 업로드 QR코드`}/>}<p>{details.title}</p></div>)}</div><small>{boardUrl}</small></div>
  </>;
}
