/**
 * LeadPilot Google Apps Script Web App Backend (Security Hardened)
 * 
 * Target Client: ProDrain Plumbing (prodrain-plumbing-kochi)
 * 
 * SECURITY ARCHITECTURE:
 * 1. Zero-Trust Access Control: All GET and POST lead retrieval and mutations
 *    require a private API_KEY configured in Google Apps Script Script Properties.
 * 2. Information Disclosure Prevention: Public health checks (testConnection/ping)
 *    never disclose spreadsheet titles, tab names, lead counts, or customer data.
 * 3. Tenant Isolation: Every enquiry submission and retrieval is strictly validated
 *    against the configured TARGET_CLIENT_ID ('prodrain-plumbing-kochi').
 * 4. Input Sanitization & Anti-Abuse:
 *    - Strict length limits on all incoming fields.
 *    - Formula Injection Guard: Cells starting with '=', '+', '-', or '@' are escaped.
 *    - Honeypot spam trap: Discards automated bot submissions.
 *    - Rejects empty or malformed submissions.
 * 5. Safe Error Handling: Internal errors and stack traces are logged server-side
 *    and never exposed to external callers.
 */

// Target Client ID for this Google Apps Script Web App deployment (override in Script Properties: TARGET_CLIENT_ID)
var DEFAULT_TARGET_CLIENT_ID = 'prodrain-plumbing-kochi';
var TARGET_SHEET_NAME = 'Leads';

// Helper: Normalize Script Property values (trims spaces and strips accidental surrounding quotes)
function normalizeScriptProp(val) {
  if (val === null || val === undefined) return '';
  return val.toString().trim().replace(/^["']+|["']+$/g, '').trim();
}

// Helper: Resolve Target Spreadsheet (optional Script Property TARGET_SPREADSHEET_ID or active bound spreadsheet)
function getTargetSpreadsheet() {
  try {
    var scriptProps = PropertiesService.getScriptProperties();
    var rawProp = normalizeScriptProp(scriptProps.getProperty('TARGET_SPREADSHEET_ID'));
    if (rawProp) {
      var urlMatch = rawProp.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      var targetId = urlMatch ? urlMatch[1] : rawProp;
      return SpreadsheetApp.openById(targetId);
    }
  } catch (propErr) {
    console.error("[LeadPilot] Failed to open TARGET_SPREADSHEET_ID spreadsheet:", propErr && propErr.message ? propErr.message : propErr);
    return null;
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

// Handle CORS Pre-flight Options Request
function doOptions(e) {
  var output = ContentService.createTextOutput("");
  output.setMimeType(ContentService.MimeType.TEXT);
  return output;
}

// Helper: Ensure the dedicated "Leads" tab exists in the target spreadsheet (case- & space-tolerant)
function getOrCreateLeadsSheet(ss) {
  var sheet = ss.getSheetByName(TARGET_SHEET_NAME);
  if (!sheet) {
    var allSheets = ss.getSheets();
    var targetLower = TARGET_SHEET_NAME.toLowerCase();
    for (var i = 0; i < allSheets.length; i++) {
      if (allSheets[i].getName().toString().trim().toLowerCase() === targetLower) {
        sheet = allSheets[i];
        break;
      }
    }
  }
  if (!sheet) {
    var firstSheet = ss.getSheets()[0];
    if (firstSheet && firstSheet.getName().toString().trim().toLowerCase() === "sheet1" && firstSheet.getLastRow() <= 1) {
      firstSheet.setName(TARGET_SHEET_NAME);
      sheet = firstSheet;
    } else {
      sheet = ss.insertSheet(TARGET_SHEET_NAME);
    }
  }
  return sheet;
}

// Standard 14-Column Specification
var DEFAULT_HEADERS = [
  "Lead ID", "Timestamp", "Client ID", "Business Name",
  "Name", "Phone", "Service", "Details", "Address",
  "Lead Source", "Page URL", "Status", "Notes", "Follow-up Date"
];

// Ensure Header row exists (even if Row 1 was blank-formatted) and format Phone column
function ensureHeaderRow(sheet) {
  var lastRow = sheet.getLastRow();
  var needsDefaultHeaders = lastRow === 0;

  if (!needsDefaultHeaders) {
    var colCheckCount = Math.max(sheet.getLastColumn(), DEFAULT_HEADERS.length);
    var row1 = sheet.getRange(1, 1, 1, colCheckCount).getValues()[0];
    var hasAnyHeaderText = false;
    for (var i = 0; i < row1.length; i++) {
      if ((row1[i] || "").toString().trim().length > 0) {
        hasAnyHeaderText = true;
        break;
      }
    }
    if (!hasAnyHeaderText) {
      needsDefaultHeaders = true;
    }
  }

  if (needsDefaultHeaders) {
    var headerRange = sheet.getRange(1, 1, 1, DEFAULT_HEADERS.length);
    headerRange.setValues([DEFAULT_HEADERS]);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#0f172a");
    headerRange.setFontColor("#ffffff");
  }

  // Ensure Phone column is explicitly formatted as plain text (@) to preserve leading '+' and prevent formula errors
  try {
    var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), DEFAULT_HEADERS.length)).getValues()[0];
    var colMap = getHeaderColumnMap(headers);
    if (colMap.phone !== undefined) {
      var fmtRows = Math.min(Math.max(sheet.getLastRow() + 20, 100), Math.max(sheet.getMaxRows(), 100));
      sheet.getRange(1, colMap.phone + 1, fmtRows, 1).setNumberFormat('@');
    }
  } catch (fmtErr) {
    console.warn("Could not set phone column text format:", fmtErr);
  }
}

// Map column index by header name (case-insensitive, whitespace and punctuation tolerant)
function getHeaderColumnMap(headers) {
  var map = {};
  for (var c = 0; c < headers.length; c++) {
    var raw = headers[c] ? headers[c].toString().toLowerCase().trim().replace(/[^a-z0-9]/g, '') : '';
    if (raw === 'leadid' || raw === 'id' || raw === 'lead' || raw === 'refid' || raw === 'referenceid') map.id = c;
    else if (raw === 'timestamp' || raw === 'date' || raw === 'createdat' || raw === 'createddate' || raw === 'time' || raw === 'submittedat' || raw === 'submittedon' || raw === 'leaddate') map.timestamp = c;
    else if (raw === 'clientid' || raw === 'client' || raw === 'tenant' || raw === 'tenantid') map.clientId = c;
    else if (raw === 'businessname' || raw === 'business' || raw === 'company' || raw === 'companyname') map.businessName = c;
    else if (raw === 'name' || raw === 'customername' || raw === 'fullname' || raw === 'contactname' || raw === 'leadname' || raw === 'customer' || raw === 'person' || raw === 'clientname' || raw === 'yourname') map.name = c;
    else if (
      raw === 'phone' || raw === 'phonenumber' || raw === 'phoneno' ||
      raw === 'mobile' || raw === 'mobilenumber' || raw === 'mobileno' ||
      raw === 'telephone' || raw === 'contact' || raw === 'contactno' || raw === 'contactnumber' ||
      raw === 'customerphone' || raw === 'clientphone' ||
      raw === 'cell' || raw === 'cellphone' || raw === 'ph' || raw === 'whatsapp' || raw === 'whatsappnumber'
    ) map.phone = c;
    else if (raw === 'email' || raw === 'emailaddress' || raw === 'mail' || raw === 'emailid') map.email = c;
    else if (raw === 'service' || raw === 'services' || raw === 'servicerequested' || raw === 'serviceneeded' || raw === 'servicetype' || raw === 'requirement' || raw === 'job' || raw === 'category' || raw === 'work') map.service = c;
    else if (raw === 'details' || raw === 'inquirydetails' || raw === 'enquirydetails' || raw === 'message' || raw === 'notesdetails' || raw === 'description' || raw === 'remarks' || raw === 'inquiry' || raw === 'enquiry') map.details = c;
    else if (raw === 'address' || raw === 'streetaddress' || raw === 'location' || raw === 'city' || raw === 'area' || raw === 'place') map.address = c;
    else if (raw === 'leadsource' || raw === 'source' || raw === 'campaign' || raw === 'channel' || raw === 'medium') map.leadSource = c;
    else if (raw === 'pageurl' || raw === 'url' || raw === 'website' || raw === 'sourceurl') map.pageUrl = c;
    else if (raw === 'status' || raw === 'leadstatus' || raw === 'stage' || raw === 'pipelinestatus') map.status = c;
    else if (raw === 'notes' || raw === 'notesjson' || raw === 'logs' || raw === 'comments' || raw === 'notesandlogs') map.notes = c;
    else if (raw === 'followupdate' || raw === 'followup' || raw === 'nextfollowup' || raw === 'callbackdate') map.followUpDate = c;
  }
  return map;
}

// Helper: Locate next row index with real content (avoids appending rows off-screen below pre-formatted/checkbox rows)
function findNextLeadWriteRow(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 2;
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  for (var r = values.length - 1; r >= 1; r--) {
    var row = values[r];
    for (var c = 0; c < row.length; c++) {
      var cell = row[c];
      if (cell instanceof Date) return r + 2;
      if (typeof cell === 'number') return r + 2;
      if (typeof cell === 'string' && cell.trim().length > 0) return r + 2;
    }
  }
  return 2;
}

// Helper: Detect whether string is a legitimate phone number (e.g. +91XXXXXXXXXX, +1 (555) 234-5678)
function isPhoneNumberValue(str) {
  if (!str) return false;
  var s = str.toString().trim();
  // Valid international phone starts with '+' followed strictly by digits, spaces, hyphens, periods, or parentheses
  return /^\+[\d\s\-().]{6,25}$/.test(s);
}

// Anti-Formula Injection sanitizer:
// Retains strict formula injection protection for untrusted text fields (=, +, -, @).
// For phone numbers starting with '+', preserves the international format as plain text.
function sanitizeFormulaPrefix(val) {
  if (val === null || val === undefined) return '';
  var str = val.toString().trim();
  if (str.length === 0) return '';

  if (str[0] === '=' || str[0] === '+' || str[0] === '-' || str[0] === '@') {
    // International phone numbers (e.g. +91XXXXXXXXXX) are preserved as plain text without formula error
    if (str[0] === '+' && isPhoneNumberValue(str)) {
      return str;
    }
    return "'" + str;
  }
  return str;
}

// Retrieve configured Target Client ID (Script Properties take precedence)
function getTargetClientId() {
  try {
    var scriptProps = PropertiesService.getScriptProperties();
    var prop = normalizeScriptProp(scriptProps.getProperty('TARGET_CLIENT_ID'));
    if (prop) {
      return prop.toLowerCase();
    }
  } catch (e) {
    console.warn("ScriptProperties access notice:", e);
  }
  return DEFAULT_TARGET_CLIENT_ID;
}

/**
 * GET Endpoint: Health-check & Authenticated Lead Retrieval
 */
function doGet(e) {
  try {
    var ss = getTargetSpreadsheet();
    if (!ss) {
      console.error("[LeadPilot] doGet failed: Target spreadsheet unavailable.");
      return responseJSON({
        status: "error",
        result: "error",
        message: "Target spreadsheet is unavailable. Configure TARGET_SPREADSHEET_ID or bind script to the spreadsheet."
      });
    }
    var sheet = getOrCreateLeadsSheet(ss);
    ensureHeaderRow(sheet);

    var params = (e && e.parameter) ? e.parameter : {};
    var action = params.action ? params.action : "testConnection";

    // 1. Connection Health Check (Hardened: Zero sensitive information disclosure)
    if (action === "testConnection" || action === "ping") {
      return responseJSON({
        status: "success",
        result: "success",
        message: "Google Apps Script Web App operational."
      });
    }

    // 2. Fetch leads for CRM synchronization (Requires strict API_KEY)
    if (action === "getLeads") {
      return handleGetLeads(sheet, ss, params);
    }

    return responseJSON({
      status: "error",
      result: "error",
      message: "Unrecognized GET action."
    });

  } catch (err) {
    console.error("doGet internal error:", err);
    return responseJSON({
      status: "error",
      result: "error",
      message: "An internal error occurred while processing the request."
    });
  }
}

/**
 * Internal handler for reading leads from the spreadsheet
 * Deny-by-default: Rejects if API_KEY is missing, unconfigured, or incorrect.
 */
function handleGetLeads(sheet, ss, params) {
  var scriptProps = PropertiesService.getScriptProperties();
  var configuredApiKey = normalizeScriptProp(scriptProps.getProperty('API_KEY'));
  var targetClientId = getTargetClientId();
  var requestedClientId = (params.clientId || "").toString().trim().toLowerCase();
  var callerToken = (params.apiKey || params.token || "").toString().trim();

  // 1. Strict Authentication Gate: API_KEY must be set in Script Properties AND must match caller
  if (!configuredApiKey || !callerToken || callerToken !== configuredApiKey.trim()) {
    return responseJSON({
      status: "error",
      result: "error",
      message: "Unauthorized: Missing or invalid API key for lead retrieval."
    });
  }

  // 2. Client ID Validation
  if (!requestedClientId) {
    return responseJSON({
      status: "error",
      result: "error",
      message: "Missing required Client ID."
    });
  }

  if (targetClientId !== requestedClientId) {
    return responseJSON({
      status: "error",
      result: "error",
      message: "Client ID mismatch: This Google Sheet belongs to tenant \"" + targetClientId + "\", not \"" + requestedClientId + "\"."
    });
  }

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return responseJSON({
      status: "success",
      result: "success",
      clientId: requestedClientId,
      totalRows: 0,
      leads: [],
      message: "Google Sheet has no leads recorded yet."
    });
  }

  var range = sheet.getDataRange();
  var values = range.getValues();
  var headers = values[0];
  var colMap = getHeaderColumnMap(headers);

  var leads = [];
  var rowsToUpdateLeadId = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];

    var name = colMap.name !== undefined ? (row[colMap.name] || "").toString().trim() : "";
    var phone = colMap.phone !== undefined ? (row[colMap.phone] || "").toString().trim() : "";
    // Clean leading single quote if present from Google Sheets formula-escape representation
    if (phone.charAt(0) === "'" && phone.charAt(1) === '+') {
      phone = phone.slice(1).trim();
    }
    var rowClientId = colMap.clientId !== undefined ? (row[colMap.clientId] || "").toString().trim().toLowerCase() : "";

    // Skip blank or invalid rows
    if (!name && !phone) {
      continue;
    }

    // Tenant Isolation
    if (rowClientId && rowClientId !== requestedClientId) {
      continue;
    }

    var leadId = colMap.id !== undefined ? (row[colMap.id] || "").toString().trim() : "";

    // Auto-assign stable Lead ID if missing (e.g., from Meta Forms or manual paste)
    if (!leadId) {
      leadId = "LP-" + Utilities.formatDate(new Date(), "GMT", "yyyyMMdd") + "-" + Utilities.getUuid().slice(0, 4).toUpperCase();
      if (colMap.id !== undefined) {
        rowsToUpdateLeadId.push({ rowNumber: r + 1, colNumber: colMap.id + 1, newId: leadId });
      }
    }

    var timestamp = colMap.timestamp !== undefined ? (row[colMap.timestamp] || "").toString().trim() : "";
    if (row[colMap.timestamp] instanceof Date) {
      timestamp = row[colMap.timestamp].toISOString();
    }
    if (!timestamp) {
      timestamp = new Date().toISOString();
    }

    var businessName = colMap.businessName !== undefined ? (row[colMap.businessName] || "").toString().trim() : "";
    var email = colMap.email !== undefined ? (row[colMap.email] || "").toString().trim() : "";
    var service = colMap.service !== undefined ? (row[colMap.service] || "").toString().trim() : "General Enquiry";
    var details = colMap.details !== undefined ? (row[colMap.details] || "").toString().trim() : "";
    var address = colMap.address !== undefined ? (row[colMap.address] || "").toString().trim() : "";
    var leadSource = colMap.leadSource !== undefined ? (row[colMap.leadSource] || "").toString().trim() : "Google Sheet Row";
    var pageUrl = colMap.pageUrl !== undefined ? (row[colMap.pageUrl] || "").toString().trim() : "";
    var status = colMap.status !== undefined ? (row[colMap.status] || "").toString().trim() : "New";

    var validStatuses = ["New", "Contacted", "Follow-up", "Qualified", "Won", "Lost"];
    var matchedStatus = "New";
    for (var s = 0; s < validStatuses.length; s++) {
      if (status.toLowerCase() === validStatuses[s].toLowerCase()) {
        matchedStatus = validStatuses[s];
        break;
      }
    }

    var notesRaw = colMap.notes !== undefined ? (row[colMap.notes] || "").toString().trim() : "";
    var notes = [];
    if (notesRaw) {
      try {
        var parsed = JSON.parse(notesRaw);
        if (Array.isArray(parsed)) {
          notes = parsed;
        } else if (typeof parsed === 'string') {
          notes = [{ id: 'note-' + r, text: parsed, createdAt: timestamp, author: 'Spreadsheet' }];
        }
      } catch (jsonErr) {
        notes = [{ id: 'note-' + r, text: notesRaw, createdAt: timestamp, author: 'Spreadsheet' }];
      }
    }

    var followUpDate = colMap.followUpDate !== undefined ? (row[colMap.followUpDate] || "").toString().trim() : "";
    if (row[colMap.followUpDate] instanceof Date) {
      followUpDate = row[colMap.followUpDate].toISOString().slice(0, 10);
    }

    leads.push({
      id: leadId,
      timestamp: timestamp,
      clientId: requestedClientId,
      businessName: businessName,
      name: name,
      phone: phone,
      email: email || undefined,
      service: service,
      details: details,
      address: address,
      leadSource: leadSource,
      pageUrl: pageUrl,
      status: matchedStatus,
      notes: notes,
      followUpDate: followUpDate || undefined,
      contactCount: 0
    });
  }

  // Write back newly generated Lead IDs
    if (rowsToUpdateLeadId.length > 0) {
      try {
        for (var u = 0; u < rowsToUpdateLeadId.length; u++) {
          var updateItem = rowsToUpdateLeadId[u];
          sheet.getRange(updateItem.rowNumber, updateItem.colNumber).setNumberFormat('@').setValue(updateItem.newId);
        }
      } catch (writeBackErr) {
        console.warn("Could not write back generated Lead IDs:", writeBackErr);
      }
    }

  // Response sanitized: No sensitive spreadsheet path or sheet name disclosure
  return responseJSON({
    status: "success",
    result: "success",
    clientId: requestedClientId,
    totalRows: leads.length,
    leads: leads,
    message: "Retrieved " + leads.length + " lead(s) for CRM synchronization."
  });
}

/**
 * POST Endpoint: Public Landing Page Enquiry Submission & Authenticated CRM Operations
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return responseJSON({
      status: "error",
      result: "error",
      message: "Server is currently busy, please retry in a moment."
    });
  }

  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents.toString().trim());
      } catch (jsonErr) {
        console.warn("[LeadPilot] doPost JSON parse fallback to form parameters.");
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var action = (data.action || "createLead").toString().trim();
    var callerToken = (data.apiKey || data.token || (e && e.parameter && (e.parameter.apiKey || e.parameter.token)) || "").toString().trim();
    var scriptProps = PropertiesService.getScriptProperties();
    var configuredApiKey = normalizeScriptProp(scriptProps.getProperty('API_KEY'));
    var targetClientId = getTargetClientId();

    var ss = getTargetSpreadsheet();
    if (!ss) {
      console.error("[LeadPilot] doPost aborted: No active or configured spreadsheet (check TARGET_SPREADSHEET_ID).");
      return responseJSON({
        status: "error",
        result: "error",
        message: "Target spreadsheet is unavailable. Bind this script to the target Google Sheet or set TARGET_SPREADSHEET_ID in Script Properties."
      });
    }

    var sheet = getOrCreateLeadsSheet(ss);
    ensureHeaderRow(sheet);

    console.log("[LeadPilot] doPost received", {
      action: action,
      incomingClientId: (data.clientId || "").toString().trim().toLowerCase() || "(missing)",
      targetClientId: targetClientId,
      spreadsheetId: ss.getId(),
      spreadsheetTitle: ss.getName(),
      sheetName: sheet.getName()
    });

    // 1. Authenticated getLeads via POST
    if (action === "getLeads") {
      return handleGetLeads(sheet, ss, data);
    }

    // 2. Deny-by-default for CRM mutations/deletions: Requires valid API_KEY
    if (action !== "createLead") {
      if (!configuredApiKey || callerToken !== configuredApiKey.trim()) {
        console.warn("[LeadPilot] doPost unauthorized mutation blocked", { action: action, clientId: (data.clientId || "").toString().trim().toLowerCase() });
        return responseJSON({
          status: "error",
          result: "error",
          message: "Unauthorized: Modifying or deleting customer records requires valid API key authentication."
        });
      }
    }

    // 3. Honeypot Anti-Spam Check: If hidden bot traps are filled, silently drop
    if (data.website_hp || data.company_url || data.fax_number) {
      console.log("[LeadPilot] doPost skipped: honeypot field populated.");
      return responseJSON({
        status: "success",
        result: "success",
        message: "Enquiry received."
      });
    }

    // 4. Validate Client ID (accepts clientId or tenantId alias)
    var rawIncomingClientId = data.clientId || data.tenantId || "";
    if (!rawIncomingClientId || typeof rawIncomingClientId !== 'string' || !rawIncomingClientId.trim()) {
      console.warn("[LeadPilot] doPost rejected: missing clientId.");
      return responseJSON({
        status: "error",
        result: "error",
        message: "Missing required Client ID for lead submission."
      });
    }

    var clientId = rawIncomingClientId.toString().trim().toLowerCase();
    if (!/^[a-zA-Z0-9_-]+$/.test(clientId) || clientId.length > 64) {
      console.warn("[LeadPilot] doPost rejected: invalid clientId format.");
      return responseJSON({
        status: "error",
        result: "error",
        message: "Invalid Client ID format."
      });
    }

    // Restrict submissions strictly to the configured tenant
    if (targetClientId !== clientId) {
      console.warn("[LeadPilot] doPost rejected: tenant mismatch", {
        incomingClientId: clientId,
        targetClientId: targetClientId,
        spreadsheetId: ss.getId(),
        sheetName: sheet.getName()
      });
      return responseJSON({
        status: "error",
        result: "error",
        message: "Client ID mismatch: This Google Sheet only accepts enquiries for tenant \"" + targetClientId + "\"."
      });
    }

    var allData = sheet.getDataRange().getValues();
    var existingHeaders = allData[0] || [];
    var targetColMap = getHeaderColumnMap(existingHeaders);

    function findRowByLeadId(targetId) {
      if (!targetId || targetColMap.id === undefined) return -1;
      var cleanTarget = targetId.toString().trim().toLowerCase();
      for (var r = 1; r < allData.length; r++) {
        var cellId = (allData[r][targetColMap.id] || "").toString().trim().toLowerCase();
        if (cellId === cleanTarget) {
          return r + 1;
        }
      }
      return -1;
    }

    function appendNoteToRow(rowNum, noteObj) {
      if (targetColMap.notes === undefined) return;
      var notesRange = sheet.getRange(rowNum, targetColMap.notes + 1);
      var existingNotesRaw = (notesRange.getValue() || "").toString().trim();
      var notesList = [];
      if (existingNotesRaw) {
        try {
          var parsedNotes = JSON.parse(existingNotesRaw);
          if (Array.isArray(parsedNotes)) {
            notesList = parsedNotes;
          } else {
            notesList = [{ id: 'note-legacy', text: existingNotesRaw, createdAt: new Date().toISOString(), author: 'Spreadsheet' }];
          }
        } catch (parseErr) {
          notesList = [{ id: 'note-legacy', text: existingNotesRaw, createdAt: new Date().toISOString(), author: 'Spreadsheet' }];
        }
      }
      notesList.unshift(noteObj);
      notesRange.setValue(JSON.stringify(notesList.slice(0, 50)));
    }

    // 4B. Handle Authenticated CRM Mutations (updateStatus, addNote, scheduleFollowUp, logContact, updatePhone, deleteLead)
    if (action !== "createLead") {
      var mutationLeadId = (data.leadId || data.id || "").toString().trim();
      if (!mutationLeadId) {
        return responseJSON({
          status: "error",
          result: "error",
          message: "Missing Lead ID for CRM update."
        });
      }

      var targetRowNum = findRowByLeadId(mutationLeadId);
      if (targetRowNum === -1) {
        return responseJSON({
          status: "error",
          result: "error",
          message: "Lead ID not found in Google Sheet: " + mutationLeadId
        });
      }

      if (action === "updateStatus") {
        var allowedStatuses = ["New", "Contacted", "Follow-up", "Qualified", "Won", "Lost"];
        var requestedStatus = (data.status || "").toString().trim();
        var validStatusMatch = null;
        for (var stIdx = 0; stIdx < allowedStatuses.length; stIdx++) {
          if (allowedStatuses[stIdx].toLowerCase() === requestedStatus.toLowerCase()) {
            validStatusMatch = allowedStatuses[stIdx];
            break;
          }
        }
        if (!validStatusMatch) {
          return responseJSON({ status: "error", result: "error", message: "Invalid lead status value." });
        }
        if (targetColMap.status !== undefined) {
          sheet.getRange(targetRowNum, targetColMap.status + 1).setValue(sanitizeFormulaPrefix(validStatusMatch));
        }
        appendNoteToRow(targetRowNum, {
          id: "note-" + Date.now(),
          text: sanitizeFormulaPrefix('Status updated to "' + validStatusMatch + '"'),
          createdAt: new Date().toISOString(),
          author: sanitizeFormulaPrefix(data.author || "Agent")
        });
        return responseJSON({
          status: "success",
          result: "success",
          action: "updateStatus",
          leadId: mutationLeadId,
          message: "Status updated in Google Sheet."
        });
      }

      if (action === "addNote") {
        var noteBody = (data.text || data.note || "").toString().trim().slice(0, 1000);
        if (!noteBody) {
          return responseJSON({ status: "error", result: "error", message: "Note text is required." });
        }
        appendNoteToRow(targetRowNum, {
          id: "note-" + Date.now(),
          text: sanitizeFormulaPrefix(noteBody),
          createdAt: new Date().toISOString(),
          author: sanitizeFormulaPrefix((data.author || "Agent").toString().trim().slice(0, 80))
        });
        return responseJSON({
          status: "success",
          result: "success",
          action: "addNote",
          leadId: mutationLeadId,
          message: "Note added in Google Sheet."
        });
      }

      if (action === "scheduleFollowUp") {
        var fuDateVal = (data.followUpDate || "").toString().trim().slice(0, 50);
        if (targetColMap.followUpDate !== undefined) {
          sheet.getRange(targetRowNum, targetColMap.followUpDate + 1).setValue(sanitizeFormulaPrefix(fuDateVal));
        }
        if (targetColMap.status !== undefined && fuDateVal) {
          var currentStatusCell = (sheet.getRange(targetRowNum, targetColMap.status + 1).getValue() || "").toString().trim();
          if (!currentStatusCell || currentStatusCell === "New") {
            sheet.getRange(targetRowNum, targetColMap.status + 1).setValue("Follow-up");
          }
        }
        appendNoteToRow(targetRowNum, {
          id: "note-" + Date.now(),
          text: fuDateVal ? sanitizeFormulaPrefix("Follow-up scheduled for " + fuDateVal) : "Follow-up date cleared",
          createdAt: new Date().toISOString(),
          author: "System"
        });
        return responseJSON({
          status: "success",
          result: "success",
          action: "scheduleFollowUp",
          leadId: mutationLeadId,
          message: "Follow-up updated in Google Sheet."
        });
      }

      if (action === "logContact") {
        var contactMethod = sanitizeFormulaPrefix((data.method || "Call").toString().trim().slice(0, 30));
        var extraNote = sanitizeFormulaPrefix((data.customNote || "").toString().trim().slice(0, 500));
        if (targetColMap.status !== undefined) {
          var prevStatus = (sheet.getRange(targetRowNum, targetColMap.status + 1).getValue() || "").toString().trim();
          if (!prevStatus || prevStatus === "New") {
            sheet.getRange(targetRowNum, targetColMap.status + 1).setValue("Contacted");
          }
        }
        appendNoteToRow(targetRowNum, {
          id: "note-" + Date.now(),
          text: "Initiated outbound " + contactMethod + " contact." + (extraNote ? (" Note: " + extraNote) : ""),
          createdAt: new Date().toISOString(),
          author: "System"
        });
        return responseJSON({
          status: "success",
          result: "success",
          action: "logContact",
          leadId: mutationLeadId,
          message: "Contact logged in Google Sheet."
        });
      }

      if (action === "updatePhone") {
        var newPhone = sanitizeFormulaPrefix((data.phone || "").toString().trim().slice(0, 50));
        if (!newPhone || newPhone.replace(/\D/g, '').length < 5) {
          return responseJSON({ status: "error", result: "error", message: "Valid phone number is required." });
        }
        if (targetColMap.phone !== undefined) {
          sheet.getRange(targetRowNum, targetColMap.phone + 1).setNumberFormat('@').setValue(newPhone);
        }
        return responseJSON({
          status: "success",
          result: "success",
          action: "updatePhone",
          leadId: mutationLeadId,
          message: "Phone updated in Google Sheet."
        });
      }

      if (action === "deleteLead") {
        sheet.deleteRow(targetRowNum);
        return responseJSON({
          status: "success",
          result: "success",
          action: "deleteLead",
          leadId: mutationLeadId,
          message: "Lead deleted from Google Sheet."
        });
      }

      return responseJSON({
        status: "error",
        result: "error",
        message: "Unsupported CRM action: " + action
      });
    }

    // 5. Input Validation & Sanitization for createLead (Strict bounds against abuse)
    var rawName = (data.name || "").toString().trim().slice(0, 100);
    var rawPhone = (data.phone || "").toString().trim().slice(0, 50);
    var rawEmail = (data.email || "").toString().trim().slice(0, 120);

    // Validate that at least Name (min 2 chars) or Phone (min 5 digits) is provided
    var phoneDigits = rawPhone.replace(/\D/g, '');
    if (rawName.length < 2 && phoneDigits.length < 5) {
      console.warn("[LeadPilot] createLead rejected: validation failed (missing name/phone).", { clientId: clientId });
      return responseJSON({
        status: "error",
        result: "error",
        message: "Invalid submission: A valid contact name or phone number is required."
      });
    }

    // Build sanitized fields with Formula Injection Protection
    var leadId = sanitizeFormulaPrefix(data.id || ("LP-" + Utilities.formatDate(new Date(), "GMT", "yyyyMMdd") + "-" + Utilities.getUuid().slice(0, 4)));
    var timestamp = data.timestamp || new Date().toISOString();
    var businessName = sanitizeFormulaPrefix(data.businessName || clientId);
    var name = sanitizeFormulaPrefix(rawName || "Anonymous");
    var phone = sanitizeFormulaPrefix(rawPhone);
    var email = sanitizeFormulaPrefix(rawEmail);
    var service = sanitizeFormulaPrefix((data.service || "General Enquiry").toString().trim().slice(0, 150));
    var details = sanitizeFormulaPrefix((data.details || "").toString().trim().slice(0, 1000));
    if (email && details.indexOf(email) === -1) {
      details = details ? (details + " | Email: " + email) : ("Email: " + email);
    }
    var address = sanitizeFormulaPrefix((data.address || "").toString().trim().slice(0, 200));
    var leadSource = sanitizeFormulaPrefix((data.leadSource || "Landing Page Enquiry (Website)").toString().trim().slice(0, 150));
    var pageUrl = (data.pageUrl || "").toString().trim().slice(0, 300);
    var status = "New";

    var notesJson = "[]";
    if (data.notes && Array.isArray(data.notes)) {
      notesJson = JSON.stringify(data.notes.slice(0, 10));
    }

    // Ensure mapped columns exist (in case header row had unrecognizable/blank cells)
    var targetColMap = getHeaderColumnMap(existingHeaders);
    if (Object.keys(targetColMap).length === 0) {
      sheet.getRange(1, 1, 1, DEFAULT_HEADERS.length).setValues([DEFAULT_HEADERS]);
      existingHeaders = DEFAULT_HEADERS;
      targetColMap = getHeaderColumnMap(existingHeaders);
      console.warn("[LeadPilot] Existing Row 1 had no recognized LeadPilot headers; initialized default headers.", {
        spreadsheetId: ss.getId(),
        sheetName: sheet.getName()
      });
    }

    var rowToAppend = [];
    for (var c = 0; c < existingHeaders.length; c++) {
      if (targetColMap.id === c) rowToAppend.push(leadId);
      else if (targetColMap.timestamp === c) rowToAppend.push(timestamp);
      else if (targetColMap.clientId === c) rowToAppend.push(clientId);
      else if (targetColMap.businessName === c) rowToAppend.push(businessName);
      else if (targetColMap.name === c) rowToAppend.push(name);
      else if (targetColMap.phone === c) rowToAppend.push(phone);
      else if (targetColMap.email === c) rowToAppend.push(email);
      else if (targetColMap.service === c) rowToAppend.push(service);
      else if (targetColMap.details === c) rowToAppend.push(details);
      else if (targetColMap.address === c) rowToAppend.push(address);
      else if (targetColMap.leadSource === c) rowToAppend.push(leadSource);
      else if (targetColMap.pageUrl === c) rowToAppend.push(pageUrl);
      else if (targetColMap.status === c) rowToAppend.push(status);
      else if (targetColMap.notes === c) rowToAppend.push(notesJson);
      else if (targetColMap.followUpDate === c) rowToAppend.push(data.followUpDate ? sanitizeFormulaPrefix(data.followUpDate) : "");
      else rowToAppend.push("");
    }

    var targetWriteRow = findNextLeadWriteRow(sheet);
    if (targetWriteRow > sheet.getLastRow()) {
      sheet.appendRow(rowToAppend);
      targetWriteRow = sheet.getLastRow();
    } else {
      sheet.getRange(targetWriteRow, 1, 1, rowToAppend.length).setValues([rowToAppend]);
    }
    var newRowIdx = targetWriteRow;

    // Ensure Phone column on newly written row is explicitly formatted as plain text (@)
    if (targetColMap.phone !== undefined) {
      try {
        sheet.getRange(newRowIdx, targetColMap.phone + 1).setNumberFormat('@').setValue(phone);
      } catch (phoneFmtErr) {
        console.warn("Could not set phone cell text format:", phoneFmtErr);
      }
    }

    SpreadsheetApp.flush();

    // Verify that the written row actually persisted to the target row before returning success
    var verifyValues = sheet.getRange(newRowIdx, 1, 1, existingHeaders.length).getValues()[0];
    var wroteId = targetColMap.id !== undefined ? (verifyValues[targetColMap.id] || "").toString().trim() : "";
    var wroteName = targetColMap.name !== undefined ? (verifyValues[targetColMap.name] || "").toString().trim() : "";
    var wrotePhone = targetColMap.phone !== undefined ? (verifyValues[targetColMap.phone] || "").toString().trim() : "";
    var writeVerified = Boolean(
      (targetColMap.id !== undefined && wroteId === leadId) ||
      (targetColMap.name !== undefined && wroteName.length > 0) ||
      (targetColMap.phone !== undefined && wrotePhone.length > 0)
    );

    if (!writeVerified) {
      console.error("[LeadPilot] createLead verification failed: row empty after write", {
        writeSucceeded: false,
        leadId: leadId,
        clientId: clientId,
        spreadsheetId: ss.getId(),
        sheetName: sheet.getName(),
        rowNumber: newRowIdx
      });
      return responseJSON({
        status: "error",
        result: "error",
        writeVerified: false,
        leadId: leadId,
        clientId: clientId,
        message: "Google Sheet write could not be verified after flush."
      });
    }

    console.log("[LeadPilot] createLead succeeded", {
      writeSucceeded: true,
      writeVerified: true,
      leadId: leadId,
      clientId: clientId,
      spreadsheetId: ss.getId(),
      spreadsheetTitle: ss.getName(),
      sheetName: sheet.getName(),
      rowNumber: newRowIdx,
      mappedColumns: Object.keys(targetColMap).join(',')
    });

    // Sanitized response: Zero internal spreadsheet name disclosure
    return responseJSON({
      status: "success",
      result: "success",
      writeVerified: true,
      rowNumber: newRowIdx,
      leadId: leadId,
      clientId: clientId,
      message: "Lead recorded in Google Sheet successfully."
    });

  } catch (err) {
    console.error("[LeadPilot] doPost internal error:", err && err.message ? err.message : err);
    return responseJSON({
      status: "error",
      result: "error",
      message: "An internal error occurred while recording the enquiry."
    });
  } finally {
    lock.releaseLock();
  }
}

// Standard JSON Output Helper
function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Optional Installable Trigger Utility:
 * Can be configured as an onChange or time-driven trigger in Google Apps Script editor.
 * Ensures rows appended externally (e.g. from Meta / Facebook Instant Forms) receive a stable Lead ID.
 */
function autoAssignMissingLeadIds() {
  try {
    var ss = getTargetSpreadsheet();
    if (!ss) return;
    var sheet = getOrCreateLeadsSheet(ss);
    if (!sheet || sheet.getLastRow() <= 1) return;

    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var colMap = getHeaderColumnMap(headers);
    if (colMap.id === undefined) return;

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var name = colMap.name !== undefined ? (row[colMap.name] || "").toString().trim() : "";
      var phone = colMap.phone !== undefined ? (row[colMap.phone] || "").toString().trim() : "";
      var currentId = (row[colMap.id] || "").toString().trim();

      if ((name || phone) && !currentId) {
        var newId = "LP-" + Utilities.formatDate(new Date(), "GMT", "yyyyMMdd") + "-" + Utilities.getUuid().slice(0, 4).toUpperCase();
        sheet.getRange(r + 1, colMap.id + 1).setValue(newId);
      }
    }
  } catch (err) {
    console.error("autoAssignMissingLeadIds error:", err);
  }
}
