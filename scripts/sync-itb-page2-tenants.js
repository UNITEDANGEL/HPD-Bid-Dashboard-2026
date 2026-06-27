const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const dataFile = path.join(root, "public", "data", "COA_Fetcher_2026.json");
const manifestFile = path.join(root, "public", "data", "itb_source_manifest.json");

function decodePdfLiteral(value) {
  let out = "";
  for (let index = 0; index < value.length; index += 1) {
    const ch = value[index];
    if (ch !== "\\") {
      out += ch;
      continue;
    }

    const next = value[++index];
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "b") out += "\b";
    else if (next === "f") out += "\f";
    else if (/[0-7]/.test(next || "")) {
      let octal = next;
      for (let count = 0; count < 2 && /[0-7]/.test(value[index + 1] || ""); count += 1) {
        octal += value[++index];
      }
      out += String.fromCharCode(parseInt(octal, 8));
    } else if (next === "\r" || next === "\n") {
      if (next === "\r" && value[index + 1] === "\n") index += 1;
    } else if (next) {
      out += next;
    }
  }
  return out;
}

function decodePdfHex(value) {
  const clean = value.replace(/\s+/g, "");
  let out = "";
  for (let index = 0; index < clean.length; index += 2) {
    const byte = parseInt(clean.slice(index, index + 2).padEnd(2, "0"), 16);
    if (Number.isFinite(byte)) out += String.fromCharCode(byte);
  }
  return out;
}

function extractStringsFromContent(content) {
  const out = [];
  let index = 0;

  while (index < content.length) {
    const ch = content[index];

    if (ch === "(") {
      let depth = 1;
      let raw = "";
      let escaped = false;
      index += 1;

      while (index < content.length && depth > 0) {
        const current = content[index++];
        if (escaped) {
          raw += `\\${current}`;
          escaped = false;
          continue;
        }
        if (current === "\\") {
          escaped = true;
          continue;
        }
        if (current === "(") {
          depth += 1;
          raw += current;
          continue;
        }
        if (current === ")") {
          depth -= 1;
          if (depth > 0) raw += current;
          continue;
        }
        raw += current;
      }

      const decoded = decodePdfLiteral(raw).trim();
      if (decoded) out.push(decoded);
      continue;
    }

    if (ch === "<" && content[index + 1] !== "<") {
      const end = content.indexOf(">", index + 1);
      if (end > index) {
        const decoded = decodePdfHex(content.slice(index + 1, end)).trim();
        if (decoded) out.push(decoded);
        index = end + 1;
        continue;
      }
    }

    index += 1;
  }

  return out;
}

function rawPdfText(filePath) {
  const bytes = fs.readFileSync(filePath);
  const binary = bytes.toString("binary");
  const pieces = [];
  let position = 0;

  while (true) {
    const streamIndex = binary.indexOf("stream", position);
    if (streamIndex < 0) break;

    const dictStart = Math.max(0, binary.lastIndexOf("<<", streamIndex));
    const dict = binary.slice(dictStart, streamIndex);
    let dataStart = streamIndex + 6;
    if (binary[dataStart] === "\r" && binary[dataStart + 1] === "\n") dataStart += 2;
    else if (binary[dataStart] === "\n" || binary[dataStart] === "\r") dataStart += 1;

    const endIndex = binary.indexOf("endstream", dataStart);
    if (endIndex < 0) break;

    if (/\/Subtype\s*\/Image/.test(dict) || (/\/Image\b/.test(dict) && /\/Width\b/.test(dict))) {
      position = endIndex + 9;
      continue;
    }

    let data = bytes.subarray(dataStart, endIndex);
    if (/FlateDecode/.test(dict)) {
      try {
        data = zlib.inflateSync(data);
      } catch {
        position = endIndex + 9;
        continue;
      }
    }

    const content = data.toString("latin1");
    if (/(Tj|TJ|BT|Tf|Tm|Td|TD)/.test(content)) {
      const strings = extractStringsFromContent(content);
      if (strings.length) pieces.push(strings.join("\n"));
    }

    position = endIndex + 9;
  }

  return pieces.join("\n");
}

function collapsePdfCharLines(text) {
  const tokens = String(text || "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  let out = "";
  for (const token of tokens) {
    if (token.length === 1 || /^[A-Z0-9.,:#$%()/-]$/.test(token)) out += token;
    else out += `${out && !out.endsWith(" ") ? " " : ""}${token} `;
  }

  return out.replace(/\s+/g, " ").trim();
}

function normalizeUnit(value) {
  return String(value || "")
    .trim()
    .replace(/^APT\.?\s*/i, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function isLikelyApartmentUnit(value) {
  const raw = String(value || "").trim();
  const unit = normalizeUnit(raw);
  if (!unit || unit.length > 8) return false;
  if (isCommonLocation(raw)) return false;
  if (/\b(FAX|PHONE|TEL|PROCUREMENT|SPECIALIST)\b/i.test(raw) || /\(\d{3}\)|\d{3}[-.\s]\d{3}[-.\s]\d{4}/.test(raw)) {
    return false;
  }

  return /^[A-Z]?\d{1,4}[A-Z]?$/i.test(unit) || /^[A-Z]{1,2}\d{1,3}[A-Z]?$/i.test(unit);
}

function isPlaceholderName(value) {
  return !value || /^(T|TENANT|JOHN DOE|N\/A|NA|UNKNOWN)$/i.test(String(value).trim());
}

function shouldReplaceTenantName(current, extracted) {
  if (!extracted) return false;
  if (isPlaceholderName(current)) return true;

  const currentCompact = String(current || "").replace(/[^A-Za-z]/g, "").toUpperCase();
  const extractedCompact = String(extracted || "").replace(/[^A-Za-z]/g, "").toUpperCase();
  return (
    Boolean(currentCompact) &&
    extractedCompact.startsWith(currentCompact) &&
    extractedCompact.length > currentCompact.length &&
    extractedCompact.length - currentCompact.length <= 6
  );
}

function isCommonLocation(value) {
  return /\b(PUBLIC|HALL|HALLWAY|HALL WAY|VESTIBULE|LOBBY|STAIR|STAIRWAY|CELLAR|BASEMENT|BOILER|BULKHEAD|ROOF|YARD|COMMON|AREA|ENTRANCE)\b/i.test(
    String(value || "")
  );
}

function appointmentNotNeeded(job, apartment) {
  const location = String(job.Location || job.location || job.ApartmentUnit || "").trim();
  const description = String(job.ItbPage3Description || job.description || job.JobDescription || "");
  const combined = `${location} ${description}`;
  if (/APT\.?\s*[A-Z0-9]/i.test(combined) || apartment) return false;
  return isCommonLocation(combined);
}

function normalizePhone(match) {
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : "";
}

function splitCompressedName(raw, fallback) {
  const cleaned = String(raw || "").replace(/[^A-Z]/g, "");
  const fallbackValue = String(fallback || "").trim();
  if (!isPlaceholderName(fallbackValue)) {
    const compactFallback = fallbackValue.replace(/[^A-Za-z]/g, "").toUpperCase();
    const extraLetters = cleaned.length - compactFallback.length;
    if (compactFallback && cleaned.includes(compactFallback) && extraLetters <= 2) {
      return fallbackValue.replace(/\s+/g, " ").trim();
    }
  }

  const firstNames = [
    "MONIQUE", "ERIN", "LATOYA", "JENEIDE", "WILLIAM", "MARIA", "JOSE", "JUAN", "LUIS", "CARLOS",
    "CARMEN", "MIGUEL", "ANGEL", "ANA", "ROSA", "JESUS", "VICTOR", "FRANCISCO", "RAFAEL", "PEDRO",
    "JORGE", "MARTA", "LUCIA", "MIRIAM", "JOHN", "MARY", "MICHAEL", "DAVID", "ROBERT", "JAMES",
    "PATRICIA", "LINDA", "BARBARA", "ELIZABETH", "JENNIFER", "SUSAN", "MARGARET", "DOROTHY",
    "LISA", "NANCY", "KAREN", "BETTY", "HELEN", "SANDRA", "DONNA", "CAROL", "RUTH", "SHARON",
    "MICHELLE", "LAURA", "SARAH", "KIMBERLY", "DEBORAH", "JESSICA", "SHIRLEY", "CYNTHIA",
    "ANGELA", "MELISSA", "BRENDA", "AMY", "ANNA", "REBECCA", "VIRGINIA", "KATHLEEN", "PAMELA",
    "MARTHA", "DEBRA", "AMANDA", "STEPHANIE", "CAROLYN", "CHRISTINE", "JANET", "CATHERINE",
    "FRANCES", "ANN", "JOYCE", "DIANE", "ALICE", "JULIE", "HEATHER", "TERESA", "DENISE", "GLORIA",
    "EVELYN", "JEAN", "CHERYL", "IRENE", "JANE", "LORI", "RACHEL", "MARILYN", "ANDREA", "SARA",
    "ANNE", "JACQUELINE", "WANDA", "BONNIE", "JULIA", "RUBY", "LOIS", "TINA", "PHYLLIS", "NORMA",
    "PAULA", "ANNIE", "LILLIAN", "EMILY", "ROBIN", "PEGGY", "CRYSTAL", "GLADYS", "RITA", "DAWN",
    "CONNIE", "FLORENCE", "TRACY", "EDNA", "TIFFANY", "GRACE", "WENDY", "VICTORIA", "EDITH",
    "KIM", "SHERRY", "SYLVIA", "JOSEPH", "THOMAS", "CHARLES", "CHRISTOPHER", "DANIEL", "MATTHEW",
    "ANTHONY", "MARK", "DONALD", "STEVEN", "PAUL", "ANDREW", "JOSHUA", "KENNETH", "KEVIN", "BRIAN",
    "GEORGE", "TIMOTHY", "RONALD", "EDWARD", "JASON", "JEFFREY", "RYAN", "JACOB", "GARY", "NICHOLAS",
    "ERIC", "STEPHEN", "JONATHAN", "LARRY", "JUSTIN", "SCOTT", "BRANDON", "BENJAMIN", "SAMUEL",
    "GREGORY", "ALEXANDER", "PATRICK", "FRANK", "RAYMOND", "JACK", "DENNIS", "JERRY", "TYLER",
    "AARON", "HENRY", "DOUGLAS", "PETER", "ADAM", "ZACHARY", "NATHAN", "WALTER", "HAROLD", "KYLE",
    "CARL", "ARTHUR", "GERALD", "ROGER", "KEITH", "LAWRENCE", "TERRY", "SEAN", "CHRISTIAN", "ALBERT"
  ];

  const first = firstNames.find((name) => cleaned.startsWith(name) && cleaned.length > name.length + 1);
  if (!first) return cleaned;
  return `${first} ${cleaned.slice(first.length)}`.trim();
}

function bestNameCandidate(raw, fallback) {
  const compact = String(raw || "").replace(/[^A-Z]/g, "");
  const candidates = [
    compact.replace(/ERPREPAIRS$/i, ""),
    compact.replace(/PREPAIRS$/i, ""),
    compact.replace(/REPAIRS$/i, ""),
    compact,
  ]
    .map((candidate) => candidate.replace(/^(TENANT|NAME)/i, "").replace(/(TENANT|NAME)$/i, ""))
    .filter((candidate, index, arr) => candidate && arr.indexOf(candidate) === index);

  const scored = candidates.map((candidate) => {
    let name = splitCompressedName(candidate, fallback);
    name = name
      .replace(/\b([A-Z]{3,})EERP$/i, "$1E")
      .replace(/\b([A-Z]{3,})P$/i, "$1")
      .trim();
    let score = 0;
    if (/\s/.test(name)) score += 6;
    if (name.length >= 6 && name.length <= 28) score += 3;
    if (/(EER|IEER|SER|GGSER|RRISER)$/i.test(name.replace(/\s+/g, ""))) score -= 4;
    if (/REPAIR|PREPAIR|HPD|VENDOR/i.test(name)) score -= 6;
    return { name, score };
  });

  scored.sort((a, b) => b.score - a.score || b.name.length - a.name.length);
  return scored[0]?.name || "";
}

function parseTenantContact(flatText, job) {
  const blockStart = flatText.indexOf("NumberofUnits:");
  const blockEnd = flatText.indexOf("Page2of3", blockStart > -1 ? blockStart : 0);
  const block = blockStart > -1 && blockEnd > blockStart ? flatText.slice(blockStart, blockEnd + "Page2of3".length) : flatText;
  const locationRaw = String(job.Location || job.location || job.ApartmentUnit || "").trim();
  const locationUnit = normalizeUnit(locationRaw);
  const commonArea = appointmentNotNeeded(job, locationUnit) || isCommonLocation(locationRaw);
  let apartment = commonArea ? "" : locationUnit;

  const phoneMatches = [...block.matchAll(/\((\d{3})\)(\d{3})-(\d{4})/g)];
  const phoneMatch = phoneMatches.length ? phoneMatches[phoneMatches.length - 1] : null;
  let rawName = "";

  if (phoneMatch && apartment) {
    const beforePhone = block.slice(0, phoneMatch.index);
    const marker = `Apt.${apartment}`;
    const aptIndex = beforePhone.lastIndexOf(marker);
    if (aptIndex > -1) rawName = beforePhone.slice(aptIndex + marker.length);
  }

  if (!apartment && !commonArea) {
    const aptMatch = block.match(/Apt\.([A-Z0-9#-]{1,5})(?=[A-Z])/);
    apartment = aptMatch ? aptMatch[1].toUpperCase() : "";
  }

  const name = rawName ? bestNameCandidate(rawName, job.TenantName || job.tenantName) : "";
  const phone = commonArea ? "" : normalizePhone(phoneMatch);
  const accessType = commonArea ? "common_area" : "apartment";

  return {
    accessType,
    appointmentNeeded: accessType === "apartment",
    apartment,
    name,
    phone,
    source: "ITB_PAGE_2",
  };
}

function fallbackTenantContact(job) {
  const locationRaw = String(job.Location || job.location || job.ApartmentUnit || "").trim();
  const apartment = isLikelyApartmentUnit(locationRaw) ? normalizeUnit(locationRaw) : "";
  const commonArea = appointmentNotNeeded(job, apartment) || isCommonLocation(locationRaw);
  const phone = commonArea ? "" : String(job.TenantPhone || job.tenantPhone || "").trim();
  const name = commonArea || isPlaceholderName(job.TenantName) ? "" : String(job.TenantName || "").trim();

  return {
    accessType: commonArea ? "common_area" : "apartment",
    appointmentNeeded: !commonArea,
    apartment: commonArea ? "" : apartment,
    name,
    phone,
    source: "ITB_PAGE_2_MISSING",
  };
}

function applyTenantContact(job, contact) {
  job.ItbTenantAccessType = contact.accessType;
  job.ItbTenantAppointmentNeeded = contact.appointmentNeeded;
  job.ItbTenantApartment = contact.apartment;
  job.ItbTenantName = contact.name;
  job.ItbTenantPhone = contact.phone;
  job.ItbTenantContactSource = contact.source;
  job.ItbTenantContactStatus = contact.appointmentNeeded
    ? contact.phone
      ? "CONTACT_FOUND"
      : "CONTACT_NEEDED"
    : "COMMON_AREA_NO_TENANT";

  if (shouldReplaceTenantName(job.TenantName, contact.name)) job.TenantName = contact.name;
  if (contact.phone) job.TenantPhone = contact.phone;
}

function main() {
  const jobs = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const entries = manifest.entries || {};
  const textCache = new Map();
  const stats = {
    jobs: jobs.length,
    confirmedItbs: Object.keys(entries).length,
    updated: 0,
    appointmentNeeded: 0,
    contactFound: 0,
    commonArea: 0,
    missingSource: 0,
  };

  for (const job of jobs) {
    const fileName = String(job.ITBFile || job.itbFile || "").trim();
    const entry = entries[fileName];
    if (!entry?.sourceFile || !fs.existsSync(entry.sourceFile)) {
      const contact = fallbackTenantContact(job);
      applyTenantContact(job, contact);
      stats.missingSource += 1;
      stats.updated += 1;
      if (contact.appointmentNeeded) stats.appointmentNeeded += 1;
      if (contact.name || contact.phone) stats.contactFound += 1;
      if (contact.accessType === "common_area") stats.commonArea += 1;
      continue;
    }

    let flatText = textCache.get(entry.sourceFile);
    if (!flatText) {
      flatText = collapsePdfCharLines(rawPdfText(entry.sourceFile));
      textCache.set(entry.sourceFile, flatText);
    }

    const contact = parseTenantContact(flatText, job);
    applyTenantContact(job, contact);

    stats.updated += 1;
    if (contact.appointmentNeeded) stats.appointmentNeeded += 1;
    if (contact.name || contact.phone) stats.contactFound += 1;
    if (contact.accessType === "common_area") stats.commonArea += 1;
  }

  fs.writeFileSync(dataFile, `${JSON.stringify(jobs, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(stats, null, 2));
}

main();
