document.getElementById("status").textContent = "JS RUNNING ✅";

let deptPieChart = null;


// frontend/app.js (matches your current index.html IDs)
document.getElementById("status").textContent = "JS LOADED ✅ v1";

const API_BASE = "https://asset-tracker-api-nurrish.azurewebsites.net/api";

const DEPT_GROUPS = [
  {
    group: "IT",
    options: ["Buffer", "Faulty", "Vendor"],
  },
  {
    group: "DRY",
    options: ["Sortation", "RSS", "AR", "Casepick", "Inventory", "Decant", "Replen", "Inbound"],
  },
  {
    group: "FRESH",
    options: ["Fresh / Frozen", "Inbound", "Others"],
  },
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

  DEPT_GROUPS.forEach(({ group, options }) => {
    const wrap = document.createElement("div");
    wrap.className = "deptGroup";

    const headerBtn = document.createElement("button");
    headerBtn.type = "button";
    headerBtn.className = "btn deptGroupBtn";
    headerBtn.textContent = group;

    const optionsBox = document.createElement("div");
    optionsBox.className = "deptOptions hidden";

    headerBtn.addEventListener("click", () => {
      
      // close other groups (accordion)
      grid.querySelectorAll(".deptOptions").forEach((box) => {
        if (box !== optionsBox) box.classList.add("hidden");
      });
      optionsBox.classList.toggle("hidden");
    });

    options.forEach((opt) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn deptBtn";
      b.textContent = opt;

      b.addEventListener("click", () => {
        
        // Save as "Group - Option"
        selectedDept = `${group} - ${opt}`;

        
        // clear old selection UI
        grid.querySelectorAll(".deptBtn").forEach((x) => x.classList.remove("selected"));
        b.classList.add("selected");

        const pill = el("deptSelected");
        if (pill) {
          pill.textContent = `Selected: ${selectedDept}`;
          pill.classList.remove("muted");
        }

        // close after choosing
        optionsBox.classList.add("hidden");
      });

      optionsBox.appendChild(b);
    });

    wrap.appendChild(headerBtn);
    wrap.appendChild(optionsBox);
    grid.appendChild(wrap);
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
// new refresh edit function
function renderDeptSummary(items) {
  const box = document.getElementById("deptSummary");
  if (!box) return;

  const counts = {};
  items.forEach(a => {
    const d = a.dept || "Unknown";
    counts[d] = (counts[d] || 0) + 1;
  });

  box.innerHTML = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([dept, n]) => `
      <div class="item">
        <div class="row-inline space-between">
          <strong>${dept}</strong>
          <span class="pill">${n}</span>
        </div>
      </div>
    `)
    .join("") || `<p class="muted small">No data</p>`;
}

function renderDeptPie(items) {
  const canvas = document.getElementById("deptPie");
  const note = document.getElementById("deptPieNote");
  if (!canvas) return;

  // Count per dept
  const counts = {};
  (items || []).forEach((a) => {
    const dept = (a.dept || "Unknown").trim() || "Unknown";
    counts[dept] = (counts[dept] || 0) + 1;
  });

  const labels = Object.keys(counts);
  const data = Object.values(counts);

  if (note) {
    const total = data.reduce((s, n) => s + n, 0);
    note.textContent = total ? `Total assets: ${total}` : "No data yet.";
  }

  // Chart.js must be loaded
  if (!window.Chart) {
    if (note) note.textContent = "Chart library not loaded (Chart.js).";
    return;
  }

  // Destroy old chart (important when refreshing)
  if (deptPieChart) {
    deptPieChart.destroy();
    deptPieChart = null;
  }

  deptPieChart = new Chart(canvas, {
    type: "pie",
    data: {
      labels,
      datasets: [{ data }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
      },
    },
  });
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
    const recentItems = items.slice(0, 5);

    renderDeptPie(items);

    if (!items.length) {
      list.innerHTML = `<p class="muted small">No records yet.</p>`;
      return;
    }

    list.innerHTML = "";
    recentItems.forEach((x) => {
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

