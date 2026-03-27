import { useState, useEffect, useCallback } from "react";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

// ─── LOCAL STORAGE HELPERS ───────────────────────────────────────────
const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
};
const save = (key, val) => localStorage.setItem(key, JSON.stringify(val));

const EMPTY_LINE = { desc: "", qty: 1, rate: 0 };
const EMPTY_PROFILE = { company: "", address: "", email: "", phone: "", taxId: "", logo: "" };
const EMPTY_DOC = {
  client: "", clientEmail: "", clientAddress: "",
  projectTitle: "", notes: "", paymentTerms: "Net 30",
  lines: [{ ...EMPTY_LINE }],
  date: new Date().toISOString().split("T")[0],
  dueDate: "",
  signatureName: "",
  signed: false,
};

// ─── APP ─────────────────────────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState("proposal"); // proposal | invoice
  const [profile, setProfile] = useState(() => load("sc_profile", EMPTY_PROFILE));
  const [doc, setDoc] = useState(() => load("sc_draft", EMPTY_DOC));
  const [history, setHistory] = useState(() => load("sc_history", []));
  const [tab, setTab] = useState("editor"); // editor | profile | history
  const [saved, setSaved] = useState(false);

  // Auto-save draft
  useEffect(() => { save("sc_draft", doc); }, [doc]);
  useEffect(() => { save("sc_profile", profile); }, [profile]);
  useEffect(() => { save("sc_history", history); }, [history]);

  const updateDoc = (k, v) => setDoc(prev => ({ ...prev, [k]: v }));
  const updateProfile = (k, v) => setProfile(prev => ({ ...prev, [k]: v }));

  // Line items
  const updateLine = (i, k, v) => {
    const lines = [...doc.lines];
    lines[i] = { ...lines[i], [k]: v };
    updateDoc("lines", lines);
  };
  const addLine = () => updateDoc("lines", [...doc.lines, { ...EMPTY_LINE }]);
  const removeLine = (i) => updateDoc("lines", doc.lines.filter((_, j) => j !== i));

  const subtotal = doc.lines.reduce((s, l) => s + (l.qty * l.rate), 0);
  const tax = 0; // Can be extended
  const total = subtotal + tax;

  // Save to history
  const saveToHistory = () => {
    const entry = { ...doc, mode, total, id: Date.now(), createdAt: new Date().toISOString() };
    setHistory(prev => [entry, ...prev]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Load from history
  const loadEntry = (entry) => {
    setDoc({ client: entry.client, clientEmail: entry.clientEmail, clientAddress: entry.clientAddress, projectTitle: entry.projectTitle, notes: entry.notes, paymentTerms: entry.paymentTerms, lines: entry.lines, date: entry.date, dueDate: entry.dueDate, signatureName: entry.signatureName || "", signed: entry.signed || false });
    setMode(entry.mode);
    setTab("editor");
  };

  const deleteEntry = (id) => setHistory(prev => prev.filter(e => e.id !== id));

  // New document
  const newDoc = () => {
    setDoc({ ...EMPTY_DOC, lines: [{ ...EMPTY_LINE }], date: new Date().toISOString().split("T")[0] });
    setMode("proposal");
  };

  // Logo handler
  const handleLogo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => updateProfile("logo", ev.target.result);
    reader.readAsDataURL(file);
  };

  // ─── PDF GENERATION ──────────────────────────────────────────────
  const generatePDF = useCallback(() => {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = pdf.internal.pageSize.getWidth();
    let y = 20;

    // Header accent bar
    pdf.setFillColor(51, 65, 85);
    pdf.rect(0, 0, w, 4, "F");

    // Company info (left)
    if (profile.logo) {
      try { pdf.addImage(profile.logo, "PNG", 15, y, 22, 22); } catch {}
    }
    const lx = profile.logo ? 42 : 15;
    pdf.setFontSize(16);
    pdf.setTextColor(15, 23, 42);
    pdf.setFont("helvetica", "bold");
    pdf.text(profile.company || "Your Company", lx, y + 6);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 116, 139);
    if (profile.address) pdf.text(profile.address, lx, y + 12);
    if (profile.email) pdf.text(profile.email, lx, y + 16);
    if (profile.phone) pdf.text(profile.phone, lx, y + 20);
    if (profile.taxId) pdf.text(`Tax ID: ${profile.taxId}`, lx, y + 24);

    // Document type (right)
    pdf.setFontSize(28);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(51, 65, 85);
    pdf.text(mode === "invoice" ? "INVOICE" : "PROPOSAL", w - 15, y + 8, { align: "right" });

    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Date: ${doc.date}`, w - 15, y + 15, { align: "right" });
    if (doc.dueDate) pdf.text(`Due: ${doc.dueDate}`, w - 15, y + 20, { align: "right" });
    pdf.text(`#${Date.now().toString(36).toUpperCase()}`, w - 15, y + 25, { align: "right" });

    y = 54;

    // Divider
    pdf.setDrawColor(226, 232, 240);
    pdf.line(15, y, w - 15, y);
    y += 8;

    // Client info
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text("BILL TO", 15, y);
    y += 5;
    pdf.setFontSize(11);
    pdf.setTextColor(15, 23, 42);
    pdf.setFont("helvetica", "bold");
    pdf.text(doc.client || "Client Name", 15, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    if (doc.clientEmail) { pdf.text(doc.clientEmail, 15, y); y += 4; }
    if (doc.clientAddress) { pdf.text(doc.clientAddress, 15, y); y += 4; }

    // Project title
    if (doc.projectTitle) {
      y += 4;
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text("PROJECT", 15, y);
      y += 5;
      pdf.setFontSize(11);
      pdf.setTextColor(15, 23, 42);
      pdf.setFont("helvetica", "bold");
      pdf.text(doc.projectTitle, 15, y);
      pdf.setFont("helvetica", "normal");
    }

    y += 10;

    // Line items table
    const tableData = doc.lines.map(l => [
      l.desc,
      l.qty.toString(),
      `$${Number(l.rate).toFixed(2)}`,
      `$${(l.qty * l.rate).toFixed(2)}`
    ]);

    pdf.autoTable({
      startY: y,
      head: [["Description", "Qty", "Rate", "Amount"]],
      body: tableData,
      margin: { left: 15, right: 15 },
      styles: { fontSize: 9, cellPadding: 4, textColor: [15, 23, 42], lineColor: [226, 232, 240] },
      headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontSize: 8, fontStyle: "bold", lineWidth: 0 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: "auto" }, 1: { halign: "center", cellWidth: 20 }, 2: { halign: "right", cellWidth: 30 }, 3: { halign: "right", cellWidth: 30 } },
    });

    y = pdf.lastAutoTable.finalY + 8;

    // Totals
    const totX = w - 15;
    pdf.setDrawColor(226, 232, 240);
    pdf.line(w - 80, y, totX, y);
    y += 6;
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    pdf.text("Subtotal", w - 80, y);
    pdf.text(`$${subtotal.toFixed(2)}`, totX, y, { align: "right" });
    y += 8;
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(15, 23, 42);
    pdf.text("Total", w - 80, y);
    pdf.text(`$${total.toFixed(2)}`, totX, y, { align: "right" });
    pdf.setFont("helvetica", "normal");

    y += 14;

    // Notes
    if (doc.notes) {
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text("NOTES", 15, y);
      y += 5;
      pdf.setFontSize(9);
      pdf.setTextColor(71, 85, 105);
      const lines = pdf.splitTextToSize(doc.notes, w - 30);
      pdf.text(lines, 15, y);
      y += lines.length * 4 + 6;
    }

    // Payment terms
    if (doc.paymentTerms) {
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text("PAYMENT TERMS", 15, y);
      y += 5;
      pdf.setFontSize(9);
      pdf.setTextColor(71, 85, 105);
      pdf.text(doc.paymentTerms, 15, y);
      y += 10;
    }

    // Signature
    if (doc.signed && doc.signatureName) {
      pdf.setDrawColor(226, 232, 240);
      pdf.line(15, y + 10, 80, y + 10);
      pdf.setFontSize(14);
      pdf.setTextColor(15, 23, 42);
      pdf.setFont("courier", "italic");
      pdf.text(doc.signatureName, 15, y + 8);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(148, 163, 184);
      pdf.text("Digitally accepted", 15, y + 15);
      pdf.text(new Date().toLocaleDateString(), 15, y + 19);
    }

    // Footer
    const ph = pdf.internal.pageSize.getHeight();
    pdf.setFillColor(51, 65, 85);
    pdf.rect(0, ph - 4, w, 4, "F");
    pdf.setFontSize(7);
    pdf.setTextColor(148, 163, 184);
    pdf.text("Generated with SoloCraft", w / 2, ph - 7, { align: "center" });

    pdf.save(`${mode}-${doc.client || "draft"}-${doc.date}.pdf`);
  }, [doc, mode, profile, subtotal, total]);

  // ─── RENDER ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-800 rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">SC</span>
            </div>
            <span className="text-lg font-semibold text-slate-800 tracking-tight">SoloCraft</span>
            <span className="text-xs text-slate-400 hidden sm:inline">Proposal to Paid</span>
          </div>
          <div className="flex items-center gap-2">
            {["editor", "profile", "history"].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${tab === t ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
                {t === "editor" ? "Editor" : t === "profile" ? "My Profile" : "History"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">

        {/* ─── EDITOR TAB ─────────────────────────────────────── */}
        {tab === "editor" && (
          <div className="space-y-6">
            {/* Mode toggle + actions */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex bg-white rounded border border-slate-200 p-0.5">
                {["proposal", "invoice"].map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`px-5 py-2 text-sm font-semibold rounded transition-all ${mode === m ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    {m === "proposal" ? "Proposal" : "Invoice"}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={newDoc} className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 rounded bg-white hover:bg-slate-50 transition-all">New</button>
                <button onClick={saveToHistory} className={`px-4 py-2 text-xs font-semibold rounded transition-all ${saved ? "bg-green-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  {saved ? "✓ Saved" : "Save"}
                </button>
                <button onClick={generatePDF} className="px-4 py-2 text-xs font-semibold bg-slate-800 text-white rounded hover:bg-slate-700 transition-all shadow-sm">
                  Download PDF
                </button>
              </div>
            </div>

            {/* Client & Project */}
            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Client Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Client Name" value={doc.client} onChange={v => updateDoc("client", v)} placeholder="Acme Corp" />
                <Input label="Client Email" value={doc.clientEmail} onChange={v => updateDoc("clientEmail", v)} placeholder="client@email.com" />
                <Input label="Client Address" value={doc.clientAddress} onChange={v => updateDoc("clientAddress", v)} placeholder="123 Main St, City" />
                <Input label="Project Title" value={doc.projectTitle} onChange={v => updateDoc("projectTitle", v)} placeholder="Website Redesign" />
                <Input label="Date" type="date" value={doc.date} onChange={v => updateDoc("date", v)} />
                <Input label="Due Date" type="date" value={doc.dueDate} onChange={v => updateDoc("dueDate", v)} />
              </div>
            </div>

            {/* Line Items */}
            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Line Items</h3>
              <div className="space-y-3">
                {/* Header */}
                <div className="hidden md:grid grid-cols-12 gap-3 text-xs font-medium text-slate-400 uppercase tracking-wide px-1">
                  <div className="col-span-6">Description</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-right">Rate</div>
                  <div className="col-span-1 text-right">Amount</div>
                  <div className="col-span-1" />
                </div>
                {doc.lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-12 gap-3 items-center">
                    <div className="col-span-12 md:col-span-6">
                      <input value={line.desc} onChange={e => updateLine(i, "desc", e.target.value)} placeholder="Service description..."
                        className="w-full px-3 py-2 border border-slate-200 rounded text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 transition" />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <input type="number" min="1" value={line.qty} onChange={e => updateLine(i, "qty", parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-slate-200 rounded text-sm text-center text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 transition" />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <input type="number" min="0" step="0.01" value={line.rate} onChange={e => updateLine(i, "rate", parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-slate-200 rounded text-sm text-right text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 transition" />
                    </div>
                    <div className="col-span-3 md:col-span-1 text-right text-sm font-medium text-slate-700">
                      ${(line.qty * line.rate).toFixed(2)}
                    </div>
                    <div className="col-span-1">
                      {doc.lines.length > 1 && (
                        <button onClick={() => removeLine(i)} className="text-slate-300 hover:text-red-400 transition text-lg">×</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={addLine} className="mt-4 px-4 py-2 text-xs font-medium text-slate-500 border border-dashed border-slate-300 rounded hover:border-slate-400 hover:text-slate-600 transition w-full">
                + Add Line Item
              </button>

              {/* Totals */}
              <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-sm text-slate-500"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                  <div className="flex justify-between text-base font-bold text-slate-800 pt-2 border-t border-slate-200">
                    <span>Total</span><span>${total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes & Terms */}
            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Notes & Terms</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                  <textarea value={doc.notes} onChange={e => updateDoc("notes", e.target.value)} rows={3} placeholder="Additional notes..."
                    className="w-full px-3 py-2 border border-slate-200 rounded text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 transition resize-none" />
                </div>
                <div>
                  <Input label="Payment Terms" value={doc.paymentTerms} onChange={v => updateDoc("paymentTerms", v)} placeholder="Net 30" />
                </div>
              </div>
            </div>

            {/* Digital Signature */}
            {mode === "proposal" && (
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Digital Acceptance</h3>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <Input label="Signee Name" value={doc.signatureName} onChange={v => updateDoc("signatureName", v)} placeholder="Full name" />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer pb-1">
                    <input type="checkbox" checked={doc.signed} onChange={e => updateDoc("signed", e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-800 focus:ring-slate-300" />
                    <span className="text-sm text-slate-600">I accept this proposal</span>
                  </label>
                </div>
                {doc.signed && doc.signatureName && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-2xl font-serif italic text-slate-700">{doc.signatureName}</p>
                    <p className="text-xs text-slate-400 mt-1">Digitally accepted · {new Date().toLocaleDateString()}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── PROFILE TAB ────────────────────────────────────── */}
        {tab === "profile" && (
          <div className="max-w-lg mx-auto">
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Company Profile</h3>
              <p className="text-xs text-slate-400 mb-4">Saved locally in your browser. Never leaves your device.</p>
              {profile.logo && (
                <div className="flex items-center gap-3 mb-2">
                  <img src={profile.logo} alt="Logo" className="w-14 h-14 object-contain rounded border border-slate-200" />
                  <button onClick={() => updateProfile("logo", "")} className="text-xs text-red-400 hover:text-red-500">Remove</button>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Company Logo</label>
                <input type="file" accept="image/*" onChange={handleLogo} className="text-xs text-slate-500" />
              </div>
              <Input label="Company Name" value={profile.company} onChange={v => updateProfile("company", v)} placeholder="Your Company LLC" />
              <Input label="Address" value={profile.address} onChange={v => updateProfile("address", v)} placeholder="123 Business St" />
              <Input label="Email" value={profile.email} onChange={v => updateProfile("email", v)} placeholder="hello@company.com" />
              <Input label="Phone" value={profile.phone} onChange={v => updateProfile("phone", v)} placeholder="+1 555-0100" />
              <Input label="Tax ID" value={profile.taxId} onChange={v => updateProfile("taxId", v)} placeholder="EIN or VAT" />
              <div className="pt-2 text-xs text-green-600 font-medium">✓ Auto-saved to browser</div>
            </div>
          </div>
        )}

        {/* ─── HISTORY TAB ────────────────────────────────────── */}
        {tab === "history" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Saved Documents</h3>
              <span className="text-xs text-slate-400">{history.length} saved</span>
            </div>
            {history.length === 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
                <p className="text-slate-400 text-sm">No saved documents yet. Create and save your first proposal or invoice.</p>
              </div>
            )}
            {history.map(entry => (
              <div key={entry.id} className="bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between hover:border-slate-300 transition">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${entry.mode === "invoice" ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600"}`}>
                      {entry.mode}
                    </span>
                    <span className="text-sm font-semibold text-slate-700">{entry.client || "Untitled"}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-400">{entry.projectTitle || "No project"}</span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-400">{new Date(entry.createdAt).toLocaleDateString()}</span>
                    <span className="text-xs font-semibold text-slate-600">${entry.total?.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => loadEntry(entry)} className="px-3 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded hover:bg-slate-50 transition">Load</button>
                  <button onClick={() => deleteEntry(entry.id)} className="px-3 py-1.5 text-xs font-medium text-red-400 border border-red-200 rounded hover:bg-red-50 transition">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <span className="text-xs text-slate-400">SoloCraft — 100% local. Your data never leaves your browser.</span>
          <span className="text-xs text-slate-300">v1.0</span>
        </div>
      </footer>
    </div>
  );
}

// ─── INPUT COMPONENT ─────────────────────────────────────────────────
function Input({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 border border-slate-200 rounded text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 transition" />
    </div>
  );
}
