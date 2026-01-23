// frontend/app.js (matches your current index.html IDs)
document.getElementById("status").textContent = "JS LOADED ✅ v1";

const API_BASE = "https://asset-tracker-api-nurrish.azurewebsites.net/api";

const DEPTS = [
  { code: "IT Buffer", label: "IT Buffer" },
  { code: "AR", label: "AR" },
  { code: "RSS", label: "RSS" },
  { code: "Inventory", label: "Inventory" },
  { code: "Casepick", label: "Casepick" },
  { code: "Replenish", label: "Replenish" },
  { code: "Dry Inbound", label: "Dry Inbound" },
  { code: "Fresh Inbound", label: "Fresh Inbound" },
  { code: "Fresh / Frozen", label: "Fresh / Frozen" },
  { code: "RMA", label: "RMA" },
];

const el = (id) => document.getElementById(id);

let selectedDept = "";
let zxingReader = null;

// ---------- UI helpers ----------
function setStatus(msg) {
  const s = el("status");
  if (s) s.textContent = msg || "";
}

function setAssignedAtNow() {
  const a = el("assignedAt");
  if (a) a.textContent = new Date().toLocaleString();
}

function renderDeptButtons() {
  const grid = el("deptGrid");
  if (!grid) return;

  grid.innerHTML = "";
  DEPTS.forEach((d) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn deptBtn";
    b.textContent = d.label;

    b.addEventListener("click", () => {
      selectedDept = d.code;
      [...grid.querySelectorAll("button")].forEach((x) =>
        x.classList.remove("selected")
      );
      b.classList.add("selected");

      const pill = el("deptSelected");
      if (pill) {
        pill.textContent = `Selected: ${d.label}`;
        pill.classList.remove("muted");
      }
    });

    grid.appendChild(b);
  });
}

//added total number dept
function showNoDept() {
  const pill = el("deptSelected");
  if (pill) {
    pill.textContent = "No dept selected";
    pill.classList.add("muted");
  }
}

function renderDeptSummary(items) {
  const box = document.getElementById("deptSummary");
  if (!box) return;

  const counts = {};
  (items || []).forEach((a) => {
    const dept = (a.dept || "").trim() || "Unknown";
    counts[dept] = (counts[dept] || 0) + 1;
  });

  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1]) // highest first
    .map(([dept, n]) => `
      <div class="item">
        <div class="row-inline space-between">
          <div><strong>${dept}</strong></div>
          <div class="pill">${n}</div>
        </div>
      </div>
    `)
    .join("");

  box.innerHTML = rows || `<p class="muted small">No data yet.</p>`;
}

async function refreshSummary() {
  try {
    setStatus("Loading summary…");
    const res = await fetch(`${API_BASE}/assets?max=500`);
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load");
    renderDeptSummary(data.items || []);
    setStatus("");
  } catch (e) {
    setStatus(`❌ ${e.message}`);
  }
}


// ---------- API ----------
async function refreshList() {
  const list = el("list");
  if (list) list.innerHTML = `<p class="muted small">Loading…</p>`;

  try {
    const res = await fetch(`${API_BASE}/assets?max=20`);
    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Load failed (${res.status})`);
    }

    if (!list) return;

    const items = data.items || [];
    if (!items.length) {
      list.innerHTML = `<p class="muted small">No records yet.</p>`;
      return;
    }

    list.innerHTML = "";
    items.forEach((x) => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div><strong>${x.assetNo}</strong> • <span class="muted">${x.dept}</span></div>
        <div class="muted small">Assigned to: ${x.assignedTo}</div>
        <div class="muted small">Assigned at: ${new Date(x.assignedAt).toLocaleString()}</div>
      `;
      list.appendChild(div);
    });

    setStatus("");
  } catch (err) {
    if (list) list.innerHTML = `<p class="muted small">❌ ${err.message}</p>`;
    setStatus(`❌ ${err.message}`);
  }
}

async function saveAsset() {
  const assetNo = (el("assetNo")?.value || "").trim();
  const assignedTo = (el("assignedTo")?.value || "").trim();

  if (!assetNo) return setStatus("❌ Asset No is required.");
  if (!selectedDept) return setStatus("❌ Please select a dept.");
  if (!assignedTo) return setStatus("❌ Please fill Assigned To.");

  const payload = {
    assetNo,
    dept: selectedDept,
    assignedTo,
    assignedAt: new Date().toISOString(),
  };

  try {
    setStatus("Saving…");

    const res = await fetch(`${API_BASE}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Save failed (${res.status})`);
    }

    setStatus("✅ Saved");
    await refreshList();
  } catch (err) {
    setStatus(`❌ ${err.message}`);
  }
}

function clearForm() {
  const asset = el("assetNo");
  const who = el("assignedTo");
  if (asset) asset.value = "";
  if (who) who.value = "";

  selectedDept = "";
  const grid = el("deptGrid");
  if (grid) [...grid.querySelectorAll("button")].forEach((x) => x.classList.remove("selected"));
  showNoDept();

  setAssignedAtNow();
  setStatus("");
}

// ---------- Scanner (ZXing-first, works on iPhone Safari) ----------
function openScanModal() {
  const m = el("scanModal");
  if (m) m.classList.remove("hidden");
}
function closeScanModal() {
  const m = el("scanModal");
  if (m) m.classList.add("hidden");
}

function stopVideoStream(video) {
  const stream = video?.srcObject;
  if (stream && stream.getTracks) stream.getTracks().forEach((t) => t.stop());
  if (video) video.srcObject = null;
}

async function startScan() {
  setStatus("");

  // ZXing (best for iPhone Safari)
  if (window.ZXing) {
    openScanModal();
    const video = el("scanVideo");

    if (!video) {
      setStatus("❌ scanVideo element missing in HTML.");
      closeScanModal();
      return;
    }

    if (!zxingReader) zxingReader = new ZXing.BrowserMultiFormatReader();

    try {
      await zxingReader.decodeFromVideoDevice(null, video, (result) => {
        if (result) {
          const value = result.getText();
          zxingReader.reset();
          stopVideoStream(video);
          closeScanModal();
          el("assetNo").value = value;
        }
      });
      return;
    } catch (e) {
      console.log(e);
      setStatus("❌ Camera scan failed. Check permission and try again.");
      closeScanModal();
      return;
    }
  }

  // Fallback message if ZXing isn't loaded
  setStatus("❌ Scanner not ready: ZXing library not loaded. Check index.html script order.");
}

function stopScan() {
  const video = el("scanVideo");
  try {
    if (zxingReader) zxingReader.reset();
  } catch (_) {}
  stopVideoStream(video);
  closeScanModal();
}

// ---------- Init ----------
function init() {
  renderDeptButtons();
  setAssignedAtNow();
  showNoDept();
  refreshList();

  el("btnSave")?.addEventListener("click", saveAsset);
  el("btnClear")?.addEventListener("click", clearForm);
  el("btnRefresh")?.addEventListener("click", refreshList);

  // Scan modal buttons
  el("btnScan")?.addEventListener("click", startScan);
  el("closeScanBtn")?.addEventListener("click", stopScan);

  // Optional: close modal if user taps outside the card
  el("scanModal")?.addEventListener("click", (e) => {
    if (e.target?.id === "scanModal") stopScan();
  });
}

document.addEventListener("DOMContentLoaded", init);
document.getElementById("btnSummaryRefresh")?.addEventListener("click", refreshSummary);

refreshSummary();

