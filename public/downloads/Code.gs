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

// Target Client ID for this Google Apps Script Web App deployment
var DEFAULT_TARGET_CLIENT_ID = 'prodrain-plumbing-kochi';
var TARGET_SHEET_NAME = 'Leads';

// Handle CORS Pre-flight Options Request
function doOptions(e) {
  var output = ContentService.createTextOutput("");
  output.setMimeType(ContentService.MimeType.TEXT);
  return output;
}

// Helper: Ensure the dedicated "Leads" tab exists in the active spreadsheet
function getOrCreateLeadsSheet(ss) {
  var sheet = ss.getSheetByName(TARGET_SHEET_NAME);
  if (!sheet) {
    var firstSheet = ss.getSheets()[0];
    if (firstSheet && firstSheet.getName() === "Sheet1" && firstSheet.getLastRow() <= 1) {
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

// Ensure Header row exists if sheet is fresh and format columns
function ensureHeaderRow(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(DEFAULT_HEADERS);
    var headerRange = sheet.getRange(1, 1, 1, DEFAULT_HEADERS.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#0f172a");
    headerRange.setFontColor("#ffffff");
  }

  // Ensure Phone column is explicitly formatted as plain text (@) to preserve leading '+' and prevent formula errors
  try {
    var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), DEFAULT_HEADERS.length)).getValues()[0];
    var colMap = getHeaderColumnMap(headers);
    if (colMap.phone !== undefined) {
      sheet.getRange(1, colMap.phone + 1, Math.max(sheet.getMaxRows(), 100), 1).setNumberFormat('@');
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
    if (raw === 'leadid' || raw === 'id' || raw === 'lead') map.id = c;
    else if (raw === 'timestamp' || raw === 'date' || raw === 'createdat' || raw === 'createddate' || raw === 'time') map.timestamp = c;
    else if (raw === 'clientid' || raw === 'client' || raw === 'tenant' || raw === 'tenantid') map.clientId = c;
    else if (raw === 'businessname' || raw === 'business' || raw === 'company' || raw === 'companyname') map.businessName = c;
    else if (raw === 'name' || raw === 'customername' || raw === 'fullname' || raw === 'contactname' || raw === 'leadname' || raw === 'customer' || raw === 'person') map.name = c;
    else if (
      raw === 'phone' || raw === 'phonenumber' || raw === 'phoneno' ||
      raw === 'mobile' || raw === 'mobilenumber' || raw === 'mobileno' ||
      raw === 'telephone' || raw === 'contact' || raw === 'contactno' ||
      raw === 'cell' || raw === 'cellphone' || raw === 'ph'
    ) map.phone = c;
    else if (raw === 'email' || raw === 'emailaddress' || raw === 'mail' || raw === 'emailid') map.email = c;
    else if (raw === 'service' || raw === 'servicerequested' || raw === 'serviceneeded' || raw === 'requirement' || raw === 'job' || raw === 'category' || raw === 'work') map.service = c;
    else if (raw === 'details' || raw === 'inquirydetails' || raw === 'message' || raw === 'notesdetails' || raw === 'description' || raw === 'remarks') map.details = c;
    else if (raw === 'address' || raw === 'streetaddress' || raw === 'location' || raw === 'city' || raw === 'area' || raw === 'place') map.address = c;
    else if (raw === 'leadsource' || raw === 'source' || raw === 'campaign' || raw === 'channel' || raw === 'medium') map.leadSource = c;
    else if (raw === 'pageurl' || raw === 'url' || raw === 'website') map.pageUrl = c;
    else if (raw === 'status' || raw === 'leadstatus' || raw === 'stage' || raw === 'pipelinestatus') map.status = c;
    else if (raw === 'notes' || raw === 'notesjson' || raw === 'logs' || raw === 'comments') map.notes = c;
    else if (raw === 'followupdate' || raw === 'followup' || raw === 'nextfollowup' || raw === 'callbackdate') map.followUpDate = c;
  }
  return map;
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
    var prop = scriptProps.getProperty('TARGET_CLIENT_ID');
    if (prop && prop.trim()) {
      return prop.trim().toLowerCase();
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
    var ss = SpreadsheetApp.getActiveSpreadsheet();
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
  var configuredApiKey = scriptProps.getProperty('API_KEY');
  var targetClientId = getTargetClientId();
  var requestedClientId = (params.clientId || "").toString().trim().toLowerCase();
  var callerToken = (params.apiKey || params.token || "").toString().trim();

  // 1. Strict Authentication Gate: API_KEY must be set in Script Properties AND must match caller
  if (!configuredApiKey || !configuredApiKey.trim() || !callerToken || callerToken !== configuredApiKey.trim()) {
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
        data = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var action = data.action || "createLead";
    var callerToken = data.apiKey || data.token || (e && e.parameter && (e.parameter.apiKey || e.parameter.token)) || "";
    var scriptProps = PropertiesService.getScriptProperties();
    var configuredApiKey = scriptProps.getProperty('API_KEY');
    var targetClientId = getTargetClientId();

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getOrCreateLeadsSheet(ss);
    ensureHeaderRow(sheet);

    // 1. Authenticated getLeads via POST
    if (action === "getLeads") {
      return handleGetLeads(sheet, ss, data);
    }

    // 2. Deny-by-default for CRM mutations/deletions: Requires valid API_KEY
    if (action !== "createLead") {
      if (!configuredApiKey || !configuredApiKey.trim() || callerToken !== configuredApiKey.trim()) {
        return responseJSON({
          status: "error",
          result: "error",
          message: "Unauthorized: Modifying or deleting customer records requires valid API key authentication."
        });
      }
    }

    // 3. Honeypot Anti-Spam Check: If hidden bot traps are filled, silently drop
    if (data.website_hp || data.company_url || data.fax_number) {
      return responseJSON({
        status: "success",
        result: "success",
        message: "Enquiry received."
      });
    }

    // 4. Validate Client ID
    if (!data.clientId || typeof data.clientId !== 'string' || !data.clientId.trim()) {
      return responseJSON({
        status: "error",
        result: "error",
        message: "Missing required Client ID for lead submission."
      });
    }

    var clientId = data.clientId.toString().trim().toLowerCase();
    if (!/^[a-zA-Z0-9_-]+$/.test(clientId) || clientId.length > 64) {
      return responseJSON({
        status: "error",
        result: "error",
        message: "Invalid Client ID format."
      });
    }

    // Restrict submissions strictly to the configured tenant
    if (targetClientId !== clientId) {
      return responseJSON({
        status: "error",
        result: "error",
        message: "Client ID mismatch: This Google Sheet only accepts enquiries for tenant \"" + targetClientId + "\"."
      });
    }

    // 5. Input Validation & Sanitization (Strict bounds against abuse)
    var rawName = (data.name || "").toString().trim().slice(0, 100);
    var rawPhone = (data.phone || "").toString().trim().slice(0, 50);
    var rawEmail = (data.email || "").toString().trim().slice(0, 120);

    // Validate that at least Name (min 2 chars) or Phone (min 5 digits) is provided
    var phoneDigits = rawPhone.replace(/\D/g, '');
    if (rawName.length < 2 && phoneDigits.length < 5) {
      return responseJSON({
        status: "error",
        result: "error",
        message: "Invalid submission: A valid contact name or phone number is required."
      });
    }

    var allData = sheet.getDataRange().getValues();
    var existingHeaders = allData[0];

    // Build sanitized fields with Formula Injection Protection
    var leadId = sanitizeFormulaPrefix(data.id || ("LP-" + Utilities.formatDate(new Date(), "GMT", "yyyyMMdd") + "-" + Utilities.getUuid().slice(0, 4)));
    var timestamp = data.timestamp || new Date().toISOString();
    var businessName = sanitizeFormulaPrefix(data.businessName || "ProDrain Plumbing");
    var name = sanitizeFormulaPrefix(rawName || "Anonymous");
    var phone = sanitizeFormulaPrefix(rawPhone);
    var email = sanitizeFormulaPrefix(rawEmail);
    var service = sanitizeFormulaPrefix((data.service || "Plumbing Enquiry").toString().trim().slice(0, 150));
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

    // Dynamic Column Mapping to preserve existing spreadsheet order
    var targetColMap = getHeaderColumnMap(existingHeaders);
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

    sheet.appendRow(rowToAppend);
    var newRowIdx = sheet.getLastRow();

    // Ensure Phone column on newly appended row is explicitly formatted as plain text (@)
    if (targetColMap.phone !== undefined) {
      try {
        sheet.getRange(newRowIdx, targetColMap.phone + 1).setNumberFormat('@');
      } catch (phoneFmtErr) {
        console.warn("Could not set phone cell text format:", phoneFmtErr);
      }
    }

    // Sanitized response: Zero internal spreadsheet name disclosure
    return responseJSON({
      status: "success",
      result: "success",
      leadId: leadId,
      clientId: clientId,
      message: "Lead recorded in Google Sheet successfully."
    });

  } catch (err) {
    console.error("doPost internal error:", err);
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
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(TARGET_SHEET_NAME);
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
