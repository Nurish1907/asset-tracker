/* frontend/app.js
   Asset Tracker - frontend logic
*/

(() => {
  // ====== CONFIG ======
  // If your API is on the same Static Web App (recommended), keep it like this:
  const API_BASE = ""; // same origin
  const API_ASSETS = `${API_BASE}/api/assets`;

  const MAX_RECENT = 10;

  // ====== DOM ======
  const elAssetNo = document.getElementById("assetNo");
  const elAssignedTo = document.getElementById("assignedTo");
  const elAssignedAt = document.getElementById("assignedAt");
  const elStatus = document.getElementById("status");

  const elSaveBtn = document.getElementById("saveBtn");
  const elClearBtn = document.getElementById("clearBtn");
  const elRefreshBtn = document.getElementById("refreshBtn");
  const elScanBtn = document.getElementById("scanBtn");

  const elRecentList = document.getElementById("recentList");
  const elDeptSelectedLabel = document.getElementById("deptSelectedLabel");

  // Scan modal (needs to exist in HTML)
  const elScanModal = document.getElementById("scanModal");
  const elScanVideo = document.getElementById("scanVideo");
  const elCloseScanBtn = document.getElementById("closeScanBtn");

  // Dept buttons: <button class="dept-btn" data-dept="AR">AR</button>
  const deptButtons = Array.from(document.querySelectorAll(".dept-btn"));

  // ====== STATE ======
  let selectedDept = "";
  let zxingReader = null;

  // ====== HELPERS ======
  function setStatus(msg, type = "info") {
    if (!elStatus) return;
    elStatus.textContent = msg || "";
    elStatus.dataset.type = type; // optional styling hook
  }

  function nowLocalString() {
    // Format like: 20/01/2026, 09:38:07 (matches your screenshots)
    return new Date().toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function setAssignedNow() {
    if (elAssignedAt) elAssignedAt.value = nowLocalString();
  }

  function sanitize(str) {
    return String(str ?? "").trim();
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function openScanModal() {
    if (!elScanModal) return;
    elScanModal.classList.remove("hidden");
  }

  function closeScanModal() {
    if (!elScanModal) return;
    elScanModal.classList.add("hidden");
  }

  function stopVideoStream(video) {
    if (!video) return;
    const stream = video.srcObject;
    if (stream && stream.getTracks) stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }

  function setAssetNo(value) {
    if (elAssetNo) elAssetNo.value = sanitize(value);
  }

  function updateDeptUI() {
    deptButtons.forEach((btn) => {
      const d = btn.dataset.dept || "";
      btn.classList.toggle("selected", d === selectedDept);
    });
    if (elDeptSelectedLabel) {
      elDeptSelectedLabel.textContent = selectedDept
        ? `Selected: ${selectedDept}`
        : "No dept selected";
    }
  }

  // ====== API ======
  async function apiGetRecent() {
    const url = `${API_ASSETS}?max=${encodeURIComponent(String(MAX_RECENT))}`;
    const res = await fetch(url, { method: "GET" });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok) {
      const msg = data?.error || `Failed to load (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  async function apiSaveAsset(payload) {
    const res = await fetch(API_ASSETS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || `Save failed (${res.status})`);
    }
    return data;
  }

  // ====== RENDER ======
  function renderRecent(items) {
    if (!elRecentList) return;

    if (!Array.isArray(items) || items.length === 0) {
      elRecentList.innerHTML = `<div class="muted">No recent records</div>`;
      return;
    }

    elRecentList.innerHTML = items
      .map((it) => {
        const assetNo = escapeHtml(it.assetNo || it.rowKey || "");
        const dept = escapeHtml(it.dept || "");
        const assignedTo = escapeHtml(it.assignedTo || "");
        const assignedAt = escapeHtml(it.assignedAt || "");
        return `
          <div class="recentItem">
            <div class="recentTop">
              <div class="recentAsset">${assetNo}</div>
              <div class="recentDept">${dept}</div>
            </div>
            <div class="recentMeta">Assigned to: ${assignedTo}</div>
            <div class="recentMeta">Assigned at: ${assignedAt}</div>
          </div>
        `;
      })
      .join("");
  }

  // ====== ACTIONS ======
  async function refreshRecent() {
    try {
      setStatus("Loading recent…");
      const data = await apiGetRecent();
      renderRecent(data.items || []);
      setStatus("");
    } catch (e) {
      setStatus(`Failed to load: ${e.message}`, "error");
    }
  }

  async function saveCurrent() {
    const assetNo = sanitize(elAssetNo?.value);
    const assignedTo = sanitize(elAssignedTo?.value);
    const dept = sanitize(selectedDept);

    if (!assetNo) return setStatus("Asset No is required.", "error");
    if (!dept) return setStatus("Please select a dept.", "error");
    if (!assignedTo) return setStatus("Assigned To is required.", "error");

    // Use ISO for backend (best practice). Keep local string for display only.
    const assignedAtISO = new Date().toISOString();

    const payload = { assetNo, dept, assignedTo, assignedAt: assignedAtISO };

    try {
      setStatus("Saving…");
      await apiSaveAsset(payload);
      setStatus("Saved ✅", "success");
      await refreshRecent();
    } catch (e) {
      setStatus(`Save failed: ${e.message}`, "error");
    }
  }

  function clearForm() {
    if (elAssetNo) elAssetNo.value = "";
    if (elAssignedTo) elAssignedTo.value = "";
    selectedDept = "";
    updateDeptUI();
    setAssignedNow();
    setStatus("");
  }

  // ====== SCANNER ======
  async function startScan() {
    // MUST be called from user gesture (button click) to allow camera access
    setStatus("");

    // Try native BarcodeDetector first (works on some Android/Chrome)
    if ("BarcodeDetector" in window) {
      try {
        const formats = [
          "qr_code",
          "code_128",
          "ean_13",
          "ean_8",
          "upc_a",
          "upc_e",
          "code_39",
        ];
        const detector = new BarcodeDetector({ formats });

        openScanModal();

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        elScanVideo.srcObject = stream;
        await elScanVideo.play();

        const tick = async () => {
          if (!elScanModal || elScanModal.classList.contains("hidden")) return;

          if (elScanVideo.readyState === elScanVideo.HAVE_ENOUGH_DATA) {
            const barcodes = await detector.detect(elScanVideo);
            if (barcodes && barcodes.length) {
              const value = barcodes[0].rawValue || "";
              stopVideoStream(elScanVideo);
              closeScanModal();
              setAssetNo(value);
              return;
            }
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        return;
      } catch (e) {
        // fall back to ZXing
        console.log("Native BarcodeDetector failed, fallback to ZXing:", e);
      }
    }

    // ZXing fallback (works on iPhone Safari)
    if (!window.ZXing) {
      setStatus(
        "Scanner library not loaded. Make sure ZXing script is added in index.html.",
        "error"
      );
      return;
    }

    openScanModal();

    if (!zxingReader) {
      zxingReader = new ZXing.BrowserMultiFormatReader();
    }

    try {
      await zxingReader.decodeFromVideoDevice(null, elScanVideo, (result) => {
        if (result) {
          const value = result.getText();
          zxingReader.reset();
          closeScanModal();
          setAssetNo(value);
        }
      });
    } catch (e) {
      console.log(e);
      setStatus("Camera scan failed. Check permission and try again.", "error");
      closeScanModal();
    }
  }

  function stopScan() {
    try {
      if (zxingReader) zxingReader.reset();
    } catch (_) {}
    stopVideoStream(elScanVideo);
    closeScanModal();
  }

  // ====== WIRE EVENTS ======
  deptButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedDept = btn.dataset.dept || "";
      updateDeptUI();
    });
  });

  if (elSaveBtn) elSaveBtn.addEventListener("click", saveCurrent);
  if (elClearBtn) elClearBtn.addEventListener("click", clearForm);
  if (elRefreshBtn) elRefreshBtn.addEventListener("click", refreshRecent);
  if (elScanBtn) elScanBtn.addEventListener("click", startScan);
  if (elCloseScanBtn) elCloseScanBtn.addEventListener("click", stopScan);

  // ====== INIT ======
  setAssignedNow();
  updateDeptUI();
  refreshRecent();
})();
