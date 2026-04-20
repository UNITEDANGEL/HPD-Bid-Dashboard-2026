const state = {
  workOrders: [],
  filteredWorkOrders: [],
  selectedRowId: "",
  map: null,
  markers: [],
  mapMode: "all",
  lastBoundsKey: "",
};

const elements = {
  searchInput: document.getElementById("searchInput"),
  boroughFilter: document.getElementById("boroughFilter"),
  statusFilter: document.getElementById("statusFilter"),
  workOrderList: document.getElementById("workOrderList"),
  detailsContent: document.getElementById("detailsContent"),
  detailsTitle: document.getElementById("detailsTitle"),
  detailsSubtitle: document.getElementById("detailsSubtitle"),
  metricTotal: document.getElementById("metricTotal"),
  metricMapped: document.getElementById("metricMapped"),
  metricAwarded: document.getElementById("metricAwarded"),
  metric2026: document.getElementById("metric2026"),
  statusText: document.getElementById("statusText"),
  refreshButton: document.getElementById("refreshButton"),
  runFetcherButton: document.getElementById("runFetcherButton"),
  showAllMapButton: document.getElementById("showAllMapButton"),
  showAwardedMapButton: document.getElementById("showAwardedMapButton"),
  showOpenMapButton: document.getElementById("showOpenMapButton"),
  focusSelectedMapButton: document.getElementById("focusSelectedMapButton"),
  resetMapButton: document.getElementById("resetMapButton"),
  mapSummary: document.getElementById("mapSummary"),
};

function safeString(value) {
  return value == null ? "" : String(value).trim();
}

function escapeHtml(value) {
  return safeString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setStatus(text, isError = false) {
  elements.statusText.textContent = text;
  elements.statusText.classList.toggle("error", isError);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function parseMoney(value) {
  const cleaned = safeString(value).replace(/[$,]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value) {
  const amount = parseMoney(value);
  if (!amount) return safeString(value) || "Not listed";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function statusColor(status) {
  const normalized = safeString(status).toLowerCase();
  if (normalized.includes("completed")) return "#16a34a";
  if (normalized.includes("awarded")) return "#f97316";
  if (normalized.includes("progress")) return "#2563eb";
  if (normalized.includes("access") || normalized.includes("refused")) return "#d97706";
  return "#64748b";
}

function statusTone(status) {
  const normalized = safeString(status).toLowerCase();
  if (normalized.includes("completed")) return "completed";
  if (normalized.includes("awarded")) return "awarded";
  if (normalized.includes("progress")) return "progress";
  if (normalized.includes("access") || normalized.includes("refused")) return "access";
  return "neutral";
}

function markerRadius(item) {
  const amount = parseMoney(item.BidAmount || item.Award_Amount);
  if (amount >= 5000) return 14;
  if (amount >= 2500) return 12;
  if (amount >= 1000) return 10;
  return 8;
}

function extractAwardYear(item) {
  const candidates = [item.AwardDate_dt, item.AwardDate, item.Award_Date];
  for (const value of candidates) {
    const text = safeString(value);
    if (!text) continue;

    const isoMatch = text.match(/\b(20\d{2})-\d{2}-\d{2}\b/);
    if (isoMatch) return Number(isoMatch[1]);

    const mdyMatch = text.match(/\b\d{1,2}\/\d{1,2}\/(\d{2,4})\b/);
    if (mdyMatch) {
      let year = Number(mdyMatch[1]);
      if (year < 100) year += 2000;
      return year;
    }
  }
  return null;
}

function populateFilters(workOrders) {
  const boroughs = uniqueSorted(workOrders.map((item) => safeString(item.Borough)));
  const statuses = uniqueSorted(workOrders.map((item) => safeString(item.displayStatus)));

  elements.boroughFilter.innerHTML = `<option value="">All boroughs</option>${boroughs
    .map((borough) => `<option value="${escapeHtml(borough)}">${escapeHtml(borough)}</option>`)
    .join("")}`;
  elements.statusFilter.innerHTML = `<option value="">All statuses</option>${statuses
    .map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`)
    .join("")}`;
}

function filterWorkOrders() {
  const search = safeString(elements.searchInput.value).toLowerCase();
  const borough = safeString(elements.boroughFilter.value);
  const status = safeString(elements.statusFilter.value);

  state.filteredWorkOrders = state.workOrders.filter((item) => {
    if (borough && safeString(item.Borough) !== borough) return false;
    if (status && safeString(item.displayStatus) !== status) return false;
    if (!search) return true;

    const haystack = [
      item.OMO,
      item.BuildingAddress,
      item.displayTrade,
      item.displayDescription,
      item.displayStatus,
    ]
      .map(safeString)
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  });

  if (!state.filteredWorkOrders.some((item) => item.rowId === state.selectedRowId)) {
    state.selectedRowId = state.filteredWorkOrders[0]?.rowId || "";
  }
}

function updateMetrics() {
  elements.metricTotal.textContent = String(state.filteredWorkOrders.length);
  elements.metricMapped.textContent = String(
    state.filteredWorkOrders.filter((item) => safeString(item.Latitude) && safeString(item.Longitude)).length
  );
  elements.metricAwarded.textContent = String(
    state.filteredWorkOrders.filter((item) => safeString(item.displayStatus).toLowerCase() === "awarded").length
  );
  elements.metric2026.textContent = String(
    state.filteredWorkOrders.filter((item) => extractAwardYear(item) === 2026).length
  );
}

function mapModeLabel(mode) {
  if (mode === "awarded") return "Awarded";
  if (mode === "open") return "Open Work";
  return "All Jobs";
}

function getMapRecords() {
  let records = state.filteredWorkOrders.filter((item) => safeString(item.Latitude) && safeString(item.Longitude));

  if (state.mapMode === "awarded") {
    records = records.filter((item) => safeString(item.displayStatus).toLowerCase() === "awarded");
  } else if (state.mapMode === "open") {
    records = records.filter((item) => !safeString(item.displayStatus).toLowerCase().includes("completed"));
  }

  return records;
}

function updateMapSummary() {
  const awarded = state.filteredWorkOrders.filter((item) => safeString(item.displayStatus).toLowerCase() === "awarded").length;
  const completed = state.filteredWorkOrders.filter((item) => safeString(item.displayStatus).toLowerCase().includes("completed")).length;
  const visibleOnMap = getMapRecords().length;
  const jobs2026 = state.filteredWorkOrders.filter((item) => extractAwardYear(item) === 2026).length;
  const boroughs = new Set(state.filteredWorkOrders.map((item) => safeString(item.Borough)).filter(Boolean)).size;
  const selected = selectedRecord();

  elements.mapSummary.innerHTML = `
    <div class="map-summary-chip">Mode: <strong>${escapeHtml(mapModeLabel(state.mapMode))}</strong></div>
    <div class="map-summary-chip">Visible: <strong>${visibleOnMap}</strong></div>
    <div class="map-summary-chip">Awarded: <strong>${awarded}</strong></div>
    <div class="map-summary-chip">Completed: <strong>${completed}</strong></div>
    <div class="map-summary-chip">2026 Jobs: <strong>${jobs2026}</strong></div>
    <div class="map-summary-chip">Boroughs: <strong>${boroughs}</strong></div>
    ${selected ? `<div class="map-summary-chip">Selected: <strong>${escapeHtml(selected.OMO)}</strong></div>` : ""}
  `;
}

function updateMapModeButtons() {
  const mappings = [
    [elements.showAllMapButton, "all"],
    [elements.showAwardedMapButton, "awarded"],
    [elements.showOpenMapButton, "open"],
  ];
  mappings.forEach(([button, mode]) => {
    button.classList.toggle("active", state.mapMode === mode);
  });
}

function renderWorkOrderList() {
  elements.workOrderList.innerHTML = "";

  if (!state.filteredWorkOrders.length) {
    elements.workOrderList.innerHTML = "<p>No work orders match the current filters.</p>";
    return;
  }

  state.filteredWorkOrders.forEach((item) => {
    const card = document.createElement("article");
    const tone = statusTone(item.displayStatus);
    const awardYear = extractAwardYear(item);
    const awardDate = safeString(item.AwardDate || item.Award_Date || item.AwardDate_dt) || "No award date";
    const amountText = formatCurrency(item.BidAmount || item.Award_Amount);
    card.className = `record-card${item.rowId === state.selectedRowId ? " active" : ""}`;
    card.innerHTML = `
      <div class="record-card-header">
        <h3>${escapeHtml(safeString(item.OMO) || "No OMO")}</h3>
        <span class="year-pill">${awardYear || "Year n/a"}</span>
      </div>
      <div class="record-badges">
        <span class="status-pill tone-${tone}">${escapeHtml(safeString(item.displayStatus) || "Pending")}</span>
        <span class="hero-pill">${escapeHtml(safeString(item.displayTrade) || "Trade n/a")}</span>
      </div>
      <div class="record-address">${escapeHtml(safeString(item.BuildingAddress) || "No address listed")}</div>
      <div class="record-meta-line">${escapeHtml(safeString(item.Borough) || "Borough n/a")} | ${escapeHtml(awardDate)}</div>
      <div class="record-card-footer">
        <span class="record-kpi">${escapeHtml(amountText)}</span>
        <span>${safeString(item.Latitude) && safeString(item.Longitude) ? "Mapped" : "No coordinates"}</span>
      </div>
    `;
    card.addEventListener("click", () => {
      state.selectedRowId = item.rowId;
      renderAll();
    });
    elements.workOrderList.appendChild(card);
  });
}

function initMap() {
  state.map = L.map("map").setView([40.7128, -74.006], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(state.map);

  const legend = L.control({ position: "bottomright" });
  legend.onAdd = function onAdd() {
    const div = L.DomUtil.create("div", "map-legend");
    div.innerHTML = `
      <h4>Legend</h4>
      <div class="legend-row"><span class="legend-dot" style="background:#f97316"></span> Awarded</div>
      <div class="legend-row"><span class="legend-dot" style="background:#2563eb"></span> In Progress</div>
      <div class="legend-row"><span class="legend-dot" style="background:#16a34a"></span> Completed</div>
      <div class="legend-row"><span class="legend-dot" style="background:#d97706"></span> Access Issues</div>
      <div class="legend-row"><span class="legend-dot" style="background:#64748b"></span> Pending / Other</div>
    `;
    return div;
  };
  legend.addTo(state.map);
}

function renderMap(forceReset = false) {
  if (!state.map) initMap();

  state.markers.forEach((marker) => marker.remove());
  state.markers = [];

  const mapped = getMapRecords();
  if (!mapped.length) {
    state.lastBoundsKey = "";
    return;
  }

  const bounds = [];
  mapped.forEach((item) => {
    const lat = Number(item.Latitude);
    const lng = Number(item.Longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const isSelected = item.rowId === state.selectedRowId;
    const color = statusColor(item.displayStatus);
    const marker = L.circleMarker([lat, lng], {
      radius: isSelected ? markerRadius(item) + 4 : markerRadius(item),
      color,
      weight: isSelected ? 4 : 2,
      fillColor: color,
      fillOpacity: 0.88,
    });

    marker.bindPopup(`
      <div class="popup-meta">
        <strong>${escapeHtml(safeString(item.OMO))}</strong><br />
        ${escapeHtml(safeString(item.BuildingAddress))}<br />
        ${escapeHtml(safeString(item.displayTrade))}<br />
        Status: ${escapeHtml(safeString(item.displayStatus))}<br />
        Bid: ${escapeHtml(formatCurrency(item.BidAmount || item.Award_Amount))}
      </div>
      <button class="popup-select" onclick="window.selectWorkOrderFromMap('${item.rowId.replace(/'/g, "\\'")}')">Select</button>
    `);

    marker.on("click", () => {
      state.selectedRowId = item.rowId;
      renderAll();
    });

    marker.addTo(state.map);
    state.markers.push(marker);
    bounds.push([lat, lng]);
  });

  const boundsKey = mapped.map((item) => item.rowId).join("|");
  if (bounds.length && (forceReset || boundsKey !== state.lastBoundsKey)) {
    state.map.fitBounds(bounds, { padding: [35, 35] });
    state.lastBoundsKey = boundsKey;
  }
}

function selectedRecord() {
  return state.filteredWorkOrders.find((item) => item.rowId === state.selectedRowId) || null;
}

function fileUrl(filePath) {
  return `/file?path=${encodeURIComponent(filePath)}`;
}

async function generateDocuments(action, affidavitType = "Work Completed") {
  const record = selectedRecord();
  if (!record) return;

  setStatus(`Generating ${action.replace("_", " ")}...`);
  try {
    const result = await fetchJson("/api/generate-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        omo: record.OMO,
        action,
        affidavitType,
      }),
    });

    if (!result.ok) {
      setStatus("Generation failed.", true);
      return;
    }

    setStatus(`Generated ${action.replace("_", " ")} for ${record.OMO}.`);
    await loadWorkOrders();
  } catch (error) {
    setStatus(error.message || "Generation failed.", true);
  }
}

async function saveRecordForm(event) {
  event.preventDefault();
  const record = selectedRecord();
  if (!record) return;

  const form = event.currentTarget;
  const payload = {
    fields: {
      statusOverride: form.statusOverride.value,
      county: form.county.value,
      tradeOverride: form.tradeOverride.value,
      bidAmountOverride: form.bidAmountOverride.value,
      bid_amount_override: form.bidAmountOverride.value,
      serviceChargeOverride: form.serviceChargeOverride.value,
      service_charge_override: form.serviceChargeOverride.value,
      workStartDate: form.workStartDate.value,
      work_start_date: form.workStartDate.value,
      workCompletionDate: form.workCompletionDate.value,
      work_completion_date: form.workCompletionDate.value,
      noWorkReason: form.noWorkReason.value,
      no_work_reason: form.noWorkReason.value,
      attempt1Date: form.attempt1Date.value,
      attempt1_date: form.attempt1Date.value,
      attempt2Date: form.attempt2Date.value,
      attempt2_date: form.attempt2Date.value,
      tenantNameOverride: form.tenantNameOverride.value,
      tenant_name_override: form.tenantNameOverride.value,
      name_of_person: form.tenantNameOverride.value,
      tenantPhoneOverride: form.tenantPhoneOverride.value,
      tenant_phone_override: form.tenantPhoneOverride.value,
      locationOverride: form.locationOverride.value,
      location_override: form.locationOverride.value,
      relationshipToBuilding: form.relationshipToBuilding.value,
      relationship_to_building: form.relationshipToBuilding.value,
      descriptionOfPerson: form.descriptionOfPerson.value,
      description_of_person: form.descriptionOfPerson.value,
      deniedPersonName: form.deniedPersonName.value,
      denied_person_name: form.deniedPersonName.value,
      deniedRelationship: form.deniedRelationship.value,
      denied_relationship: form.deniedRelationship.value,
      deniedDescription: form.deniedDescription.value,
      denied_description: form.deniedDescription.value,
      deniedPhone: form.deniedPhone.value,
      denied_phone: form.deniedPhone.value,
      partialReason: form.partialReason.value,
      partial_reason: form.partialReason.value,
      partialAmount1: form.partialAmount1.value,
      partial_amount_1: form.partialAmount1.value,
      partialAmount2: form.partialAmount2.value,
      partial_amount_2: form.partialAmount2.value,
      notes: form.notes.value,
      jobDescriptionOverride: form.jobDescriptionOverride.value,
      job_description_override: form.jobDescriptionOverride.value,
    },
  };

  await fetchJson(`/api/records/${encodeURIComponent(record.OMO)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  setStatus(`Saved record ${record.OMO}.`);
  await loadWorkOrders();
}

function renderDetails() {
  const record = selectedRecord();
  if (!record) {
    elements.detailsContent.className = "details-grid empty";
    elements.detailsTitle.textContent = "Select a work order";
    elements.detailsSubtitle.textContent = "The selected job will show COA, ITB, and editable dashboard fields.";
    elements.detailsContent.innerHTML = "<p>No work order selected.</p>";
    return;
  }

  const generated = record.generatedDocuments || {};
  const tone = statusTone(record.displayStatus);
  const coordinates =
    safeString(record.Latitude) && safeString(record.Longitude)
      ? `${safeString(record.Latitude)}, ${safeString(record.Longitude)}`
      : "No coordinates";
  const coaFrame = record.coaPath
    ? `<iframe class="pdf-frame" src="${fileUrl(record.coaPath)}"></iframe>`
    : "<p>No COA PDF found for this record.</p>";
  const itbFrame = record.itbPath
    ? `<iframe class="pdf-frame" src="${fileUrl(record.itbPath)}"></iframe>`
    : "<p>No ITB PDF found for this record.</p>";

  elements.detailsTitle.textContent = `${safeString(record.OMO)} | ${safeString(record.BuildingAddress)}`;
  elements.detailsSubtitle.textContent = `${safeString(record.displayTrade)} | ${safeString(record.displayStatus)}`;

  elements.detailsContent.className = "details-grid";
  elements.detailsContent.innerHTML = `
    <div class="details-column">
      <div class="detail-card detail-hero-card">
        <div class="detail-hero-grid">
          <div>
            <h3>${escapeHtml(safeString(record.OMO))} Job Overview</h3>
            <div class="detail-hero-meta">
              <span class="status-pill tone-${tone}">${escapeHtml(safeString(record.displayStatus) || "Pending")}</span>
              <span class="hero-pill">${escapeHtml(safeString(record.displayTrade) || "Trade n/a")}</span>
              <span class="hero-pill">${escapeHtml(safeString(record.Borough) || "Borough n/a")}</span>
              <span class="hero-pill">${escapeHtml(safeString(record.AwardDate || record.Award_Date || record.AwardDate_dt) || "No award date")}</span>
            </div>
            <p class="record-meta-line">${escapeHtml(safeString(record.BuildingAddress) || "No address listed")}</p>
          </div>
          <div class="hero-kpis">
            <div class="hero-kpi-card">
              <strong>Bid Amount</strong>
              <span>${escapeHtml(formatCurrency(record.BidAmount || record.Award_Amount))}</span>
            </div>
            <div class="hero-kpi-card">
              <strong>Tenant</strong>
              <span>${escapeHtml(safeString(record.displayTenantName) || "Not listed")}</span>
            </div>
            <div class="hero-kpi-card">
              <strong>Map Coordinates</strong>
              <span>${escapeHtml(coordinates)}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="detail-card">
        <h3>Work Order Details</h3>
        <div class="meta-grid">
          <div><strong>Status</strong><span>${escapeHtml(safeString(record.displayStatus))}</span></div>
          <div><strong>Trade</strong><span>${escapeHtml(safeString(record.displayTrade))}</span></div>
          <div><strong>Bid Amount</strong><span>${escapeHtml(formatCurrency(record.BidAmount || record.Award_Amount))}</span></div>
          <div><strong>Borough</strong><span>${escapeHtml(safeString(record.Borough))}</span></div>
          <div><strong>Tenant</strong><span>${escapeHtml(safeString(record.displayTenantName))}</span></div>
          <div><strong>Phone</strong><span>${escapeHtml(safeString(record.displayTenantPhone))}</span></div>
          <div><strong>Location</strong><span>${escapeHtml(safeString(record.displayLocation))}</span></div>
          <div><strong>Award Date</strong><span>${escapeHtml(safeString(record.AwardDate || record.Award_Date || record.AwardDate_dt))}</span></div>
        </div>
      </div>

      <div class="detail-card">
        <h3>Description</h3>
        <div class="description-box">${escapeHtml(safeString(record.displayDescription) || "No description available.")}</div>
      </div>

      <div class="detail-card">
        <h3>Edit Dashboard Fields</h3>
        <form id="recordForm">
          <div class="form-grid">
            <div>
              <label class="small-label">Status</label>
              <input name="statusOverride" value="${escapeHtml(safeString(record.displayStatus))}" />
            </div>
            <div>
              <label class="small-label">County</label>
              <input name="county" value="${escapeHtml(safeString(record.fields.county))}" />
            </div>
            <div>
              <label class="small-label">Trade</label>
              <input name="tradeOverride" value="${escapeHtml(safeString(record.displayTrade))}" />
            </div>
            <div>
              <label class="small-label">Bid Amount</label>
              <input name="bidAmountOverride" value="${escapeHtml(safeString(record.fields.bidAmountOverride || record.BidAmount || record.Award_Amount))}" />
            </div>
            <div>
              <label class="small-label">Service Charge</label>
              <input name="serviceChargeOverride" value="${escapeHtml(safeString(record.fields.serviceChargeOverride))}" />
            </div>
            <div>
              <label class="small-label">Work Start Date</label>
              <input name="workStartDate" value="${escapeHtml(safeString(record.fields.workStartDate || record.WorkStartDate || record.Work_Start_Date || record.Start_Date))}" />
            </div>
            <div>
              <label class="small-label">Work Completion Date</label>
              <input name="workCompletionDate" value="${escapeHtml(safeString(record.fields.workCompletionDate || record.WorkCompletionDate || record.CompletionDate || record.Completion_Date))}" />
            </div>
            <div>
              <label class="small-label">No Work Reason</label>
              <input name="noWorkReason" value="${escapeHtml(safeString(record.fields.noWorkReason))}" />
            </div>
            <div>
              <label class="small-label">Attempt 1 Date</label>
              <input name="attempt1Date" value="${escapeHtml(safeString(record.fields.attempt1Date))}" />
            </div>
            <div>
              <label class="small-label">Attempt 2 Date</label>
              <input name="attempt2Date" value="${escapeHtml(safeString(record.fields.attempt2Date))}" />
            </div>
            <div>
              <label class="small-label">Tenant / Person</label>
              <input name="tenantNameOverride" value="${escapeHtml(safeString(record.displayTenantName))}" />
            </div>
            <div>
              <label class="small-label">Phone</label>
              <input name="tenantPhoneOverride" value="${escapeHtml(safeString(record.displayTenantPhone))}" />
            </div>
            <div class="full">
              <label class="small-label">Location</label>
              <input name="locationOverride" value="${escapeHtml(safeString(record.displayLocation))}" />
            </div>
            <div>
              <label class="small-label">Relationship To Building</label>
              <input name="relationshipToBuilding" value="${escapeHtml(safeString(record.fields.relationshipToBuilding))}" />
            </div>
            <div>
              <label class="small-label">Description Of Person</label>
              <input name="descriptionOfPerson" value="${escapeHtml(safeString(record.fields.descriptionOfPerson))}" />
            </div>
            <div>
              <label class="small-label">Denied Person Name</label>
              <input name="deniedPersonName" value="${escapeHtml(safeString(record.fields.deniedPersonName))}" />
            </div>
            <div>
              <label class="small-label">Denied Relationship</label>
              <input name="deniedRelationship" value="${escapeHtml(safeString(record.fields.deniedRelationship))}" />
            </div>
            <div class="full">
              <label class="small-label">Denied Description</label>
              <input name="deniedDescription" value="${escapeHtml(safeString(record.fields.deniedDescription))}" />
            </div>
            <div>
              <label class="small-label">Denied Phone</label>
              <input name="deniedPhone" value="${escapeHtml(safeString(record.fields.deniedPhone))}" />
            </div>
            <div>
              <label class="small-label">Partial Reason</label>
              <input name="partialReason" value="${escapeHtml(safeString(record.fields.partialReason))}" />
            </div>
            <div>
              <label class="small-label">Partial Amount 1</label>
              <input name="partialAmount1" value="${escapeHtml(safeString(record.fields.partialAmount1))}" />
            </div>
            <div>
              <label class="small-label">Partial Amount 2</label>
              <input name="partialAmount2" value="${escapeHtml(safeString(record.fields.partialAmount2))}" />
            </div>
            <div class="full">
              <label class="small-label">Notes</label>
              <textarea name="notes" rows="4">${escapeHtml(safeString(record.displayNotes))}</textarea>
            </div>
            <div class="full">
              <label class="small-label">Job Description</label>
              <textarea name="jobDescriptionOverride" rows="10">${escapeHtml(safeString(record.displayDescription))}</textarea>
            </div>
            <div class="full">
              <button type="submit">Save Record</button>
            </div>
          </div>
        </form>
        <p class="save-state">Record edits are stored in the local runtime folder.</p>
      </div>
    </div>

    <div class="details-column">
      <div class="detail-card">
        <h3>Confirmation of Award</h3>
        <div class="doc-links">
          ${record.coaPath ? `<a class="doc-link" href="${fileUrl(record.coaPath)}" target="_blank">Open COA PDF</a>` : ""}
        </div>
        ${coaFrame}
      </div>

      <div class="detail-card">
        <h3>Invitation to Bid</h3>
        <div class="doc-links">
          ${record.itbPath ? `<a class="doc-link" href="${fileUrl(record.itbPath)}" target="_blank">Open ITB PDF</a>` : ""}
        </div>
        ${itbFrame}
      </div>

      <div class="detail-card">
        <h3>Generated Documents</h3>
        <div class="doc-links">
          ${generated.job_card_path ? `<a class="doc-link" href="${fileUrl(generated.job_card_path)}" target="_blank">Latest Job Card</a>` : "<span>No generated job card yet.</span>"}
          ${generated.invoice_path ? `<a class="doc-link" href="${fileUrl(generated.invoice_path)}" target="_blank">Latest Invoice</a>` : "<span>No generated invoice yet.</span>"}
          ${generated.affidavit_path ? `<a class="doc-link" href="${fileUrl(generated.affidavit_path)}" target="_blank">Latest Affidavit</a>` : "<span>No generated affidavit yet.</span>"}
        </div>
        <div class="generate-grid">
          <button type="button" id="generateJobCardButton">Generate Job Card</button>
          <button type="button" id="generateInvoiceButton">Generate Invoice</button>
          <button type="button" id="generateWorkAffidavitButton">Generate Work Affidavit</button>
          <button type="button" id="generateNoWorkAffidavitButton">Generate No Work Affidavit</button>
          <button type="button" id="generateBundleButton" class="full-action">Generate Full Bundle</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("recordForm").addEventListener("submit", saveRecordForm);
  document.getElementById("generateJobCardButton").addEventListener("click", () => generateDocuments("job_card"));
  document.getElementById("generateInvoiceButton").addEventListener("click", () => generateDocuments("invoice"));
  document
    .getElementById("generateWorkAffidavitButton")
    .addEventListener("click", () => generateDocuments("affidavit", "Work Completed"));
  document
    .getElementById("generateNoWorkAffidavitButton")
    .addEventListener("click", () => generateDocuments("affidavit", "No Work Completed"));
  document.getElementById("generateBundleButton").addEventListener("click", () => generateDocuments("bundle", "Work Completed"));
}

function renderAll() {
  updateMetrics();
  updateMapSummary();
  updateMapModeButtons();
  renderWorkOrderList();
  renderMap();
  renderDetails();
}

async function loadWorkOrders() {
  setStatus("Loading work orders...");
  const payload = await fetchJson("/api/work-orders");
  state.workOrders = payload.workOrders || [];
  populateFilters(state.workOrders);
  filterWorkOrders();
  renderAll();
  setStatus(`Loaded ${state.workOrders.length} work orders.`);
}

elements.searchInput.addEventListener("input", () => {
  filterWorkOrders();
  renderAll();
});

elements.boroughFilter.addEventListener("change", () => {
  filterWorkOrders();
  renderAll();
});

elements.statusFilter.addEventListener("change", () => {
  filterWorkOrders();
  renderAll();
});

elements.refreshButton.addEventListener("click", loadWorkOrders);
elements.showAllMapButton.addEventListener("click", () => {
  state.mapMode = "all";
  renderAll();
});
elements.showAwardedMapButton.addEventListener("click", () => {
  state.mapMode = "awarded";
  renderAll();
});
elements.showOpenMapButton.addEventListener("click", () => {
  state.mapMode = "open";
  renderAll();
});
elements.focusSelectedMapButton.addEventListener("click", () => {
  const record = selectedRecord();
  if (!record || !safeString(record.Latitude) || !safeString(record.Longitude) || !state.map) return;
  state.map.setView([Number(record.Latitude), Number(record.Longitude)], 16);
});
elements.resetMapButton.addEventListener("click", () => {
  renderMap(true);
});
elements.runFetcherButton.addEventListener("click", async () => {
  setStatus("Running fetcher...");
  try {
    const result = await fetchJson("/api/run-fetcher", { method: "POST" });
    if (!result.ok) {
      setStatus("Fetcher finished with errors.", true);
      return;
    }
    setStatus("Fetcher completed. Reloading data...");
    await loadWorkOrders();
  } catch (error) {
    setStatus(error.message || "Fetcher failed.", true);
  }
});

window.selectWorkOrderFromMap = function selectWorkOrderFromMap(rowId) {
  state.selectedRowId = rowId;
  renderAll();
};

loadWorkOrders().catch((error) => {
  setStatus(error.message || "Failed to load work orders.", true);
});
