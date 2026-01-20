// ====== Config ======
const API_BASE = "https://asset-tracker-api-nurrish.azurewebsites.net/api";

const DEPTS = [
  { code: "AR", label: "AR" },
  { code: "RSS", label: "RSS" },
  { code: "Inventory", label: "Inventory" },
  { code: "Casepick", label: "Casepick" },
  { code: "Replenish", label: "Replenish" },
  { code: "Dry Inbound", label: "Dry Inbound" },
  { code: "Fresh Inbound", label: "Fresh Inbound" },
  { code: "Fresh / Frozen", label: "Fresh / Frozen" },
];

// ====== Helpers ======
const el = (id) => document.getElementById(id);

let selectedDept = "";
let stream = null;
let scanning = false;

function nowIso() {
  return new Date().toISOString();
}

function setStatus(msg) {
  el("status").textContent = msg || "";
}

function setAssignedAt() {
  const d = new Date();
  el("assignedAt").textContent = d.toLocaleString();
}

// ====== Dept UI ======
function renderDeptButtons() {
  const grid = el("deptGrid");
  grid.innerHTML = "";

  DEPTS.forEach((d) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn deptBtn";
    b.textContent = d.label;
    b.onclick = () => {
      selectedDept = d.code;
      [...grid.querySelectorAll("button")].forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      el("deptSelected").textContent = `Selected: ${d.label}`;
      el("deptSelected").classList.remove("muted");
    };
    grid.appendChild(b);
  });
}

// ====== Barcode Scan ======
async function startScan() {
  setStatus("");
  el("scanMsg").textContent = "";

  if (!("BarcodeDetector" in window)) {
    el("scanMsg").textContent =
      "BarcodeDetector not supported in this browser. If this is iPhone Safari, it will work better after we deploy to HTTPS. If still not supported, we’ll add ZXing fallback.";
    el("scanArea").classList.remove("hidden");
    return;
  }

  const detector = new BarcodeDetector({
    formats: ["code_128", "ean_13", "ean_8", "qr_code", "upc_a", "upc_e"],
  });

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });

    el("video").srcObject = stream;
    await el("video").play();

    el("scanArea").classList.remove("hidden");
    scanning = true;
    el("scanMsg").textContent = "Point camera at barcode…";

    const tick = async () => {
      if (!scanning) return;

      try {
        const barcodes = await detector.detect(el("video"));
        if (barcodes && barcodes.length) {
          const raw = barcodes[0].rawValue || "";
          if (raw) {
            el("assetNo").value = raw.trim();
            el("scanMsg").textContent = `Detected: ${raw}`;
            stopScan();
            return;
          }
        }
      } catch {
        // ignore intermittent detect errors
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  } catch (err) {
    el("scanMsg").textContent = `Camera error: ${err?.message || err}`;
    el("scanArea").classList.remove("hidden");
  }
}

function stopScan() {
  scanning = false;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  el("scanArea").classList.add("hidden");
}

// ====== API calls ======
async function saveAsset() {
  const assetNo = el("assetNo").value.trim();
  const assignedTo = el("assignedTo").value.trim();

  if (!assetNo) return setStatus("❌ Asset No is required.");
  if (!selectedDept) return setStatus("❌ Please select a dept.");
  if (!assignedTo) return setStatus("❌ Please fill Assigned To.");

  const payload = {
    assetNo,
    dept: selectedDept,
    assignedTo,
    assignedAt: nowIso(),
  };

  try {
    setStatus("Saving to Azure...");

    const res = await fetch(`${API_BASE}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      // if server returned no json
    }

    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Save failed (${res.status})`);
    }

    setStatus("✅ Saved to Azure");
    await refreshList();
  } catch (err) {
    setStatus(`❌ ${err.message}`);
  }
}

async function refreshList() {
  const list = el("list");
  list.innerHTML = `<p class="muted small">Loading…</p>`;

  try {
    const res = await fetch(`${API_BASE}/assets?max=20`);
    const data = await res.json();

    list.innerHTML = "";

    if (!data.ok || !data.items?.length) {
      list.innerHTML = `<p class="muted small">No records yet.</p>`;
      return;
    }

    data.items.forEach((x) => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div><strong>${x.assetNo}</strong> • <span class="muted">${x.dept}</span></div>
        <div class="muted small">Assigned to: ${x.assignedTo}</div>
        <div class="muted small">Assigned at: ${new Date(x.assignedAt).toLocaleString()}</div>
      `;
      list.appendChild(div);
    });
  } catch (err) {
    list.innerHTML = `<p class="muted small">❌ Failed to load: ${err.message}</p>`;
  }
}

// ====== Form helpers ======
function clearForm() {
  el("assetNo").value = "";
  el("assignedTo").value = "";
  selectedDept = "";

  el("deptSelected").textContent = "No dept selected";
  el("deptSelected").classList.add("muted");

  [...el("deptGrid").querySelectorAll("button")].forEach((x) => x.classList.remove("selected"));

  setAssignedAt();
  setStatus("");
}

// ====== Init ======
function init() {
  renderDeptButtons();
  setAssignedAt();

  el("btnScan").onclick = startScan;
  el("btnStopScan").onclick = stopScan;
  el("btnSave").onclick = saveAsset;
  el("btnClear").onclick = clearForm;
  el("btnRefresh").onclick = refreshList;

  refreshList();
}

document.addEventListener("DOMContentLoaded", init);
