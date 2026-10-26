// Reads an uploaded .xlsx buffer into plain row objects, using the column
// config as the source of truth for headers (spec §6: the data sheet's
// header row drives everything). Does no business validation — only
// structural checks (file type, missing sheet/columns, template version,
// row cap) that belong before any per-row rule runs.

const ExcelJS = require("exceljs");
const { messages } = require("./messages");

const META_SHEET_NAME = "Meta";
const ROW_CAP = 2000; // conservative default; revisit once real client file sizes are known

const structuralError = (code, params) => ({
  row: null,
  column: null,
  severity: "error",
  code,
  message: messages[code](params || {}),
});

// workbook.buffer -> { ok, errors, rows, templateVersion }
async function parseWorkbook(buffer, config) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (_err) {
    return { ok: false, errors: [structuralError("WRONG_FILE_TYPE")], rows: [] };
  }

  // Legacy exports (config.acceptLegacyExport) have no template sheet names, so
  // fall back to the first worksheet; header matching below still applies.
  const dataSheet =
    workbook.getWorksheet(config.sheetName) || (config.acceptLegacyExport ? workbook.worksheets[0] : undefined);
  if (!dataSheet) {
    return {
      ok: false,
      errors: [structuralError("MISSING_SHEET", { sheetName: config.sheetName })],
      rows: [],
    };
  }

  const metaSheet = workbook.getWorksheet(META_SHEET_NAME);
  const templateVersion = metaSheet ? Number(metaSheet.getCell("B1").value) : undefined;
  const skipVersionCheck = config.acceptLegacyExport && !metaSheet;
  if (!skipVersionCheck && (!templateVersion || templateVersion !== config.templateVersion)) {
    return {
      ok: false,
      errors: [
        structuralError("OUTDATED_TEMPLATE", {
          got: templateVersion || "unknown",
          expected: config.templateVersion,
        }),
      ],
      rows: [],
    };
  }

  const headerRow = dataSheet.getRow(1);
  const headerByColumnIndex = new Map();
  headerRow.eachCell((cell, colNumber) => {
    headerByColumnIndex.set(colNumber, String(cell.value || "").trim());
  });

  const missing = [];
  const columnIndexByKey = new Map();
  config.columns.forEach((col) => {
    let found = null;
    headerByColumnIndex.forEach((header, colNumber) => {
      if (header === col.header) found = colNumber;
    });
    if (found === null) {
      missing.push(col.header);
    } else {
      columnIndexByKey.set(col.key, found);
    }
  });
  if (missing.length) {
    return {
      ok: false,
      errors: missing.map((header) => structuralError("MISSING_COLUMN", { column: header })),
      rows: [],
    };
  }

  const rows = [];
  const totalRows = dataSheet.rowCount;
  for (let rowNumber = 2; rowNumber <= totalRows; rowNumber += 1) {
    const excelRow = dataSheet.getRow(rowNumber);
    if (excelRow.cellCount === 0) continue; // fully empty row

    const row = { __rowNumber: rowNumber };
    config.columns.forEach((col) => {
      const cell = excelRow.getCell(columnIndexByKey.get(col.key));
      row[col.key] = cell.value === null || cell.value === undefined ? "" : cell.value;
    });
    rows.push(row);
  }

  if (rows.length === 0) {
    return { ok: false, errors: [structuralError("EMPTY_FILE")], rows: [] };
  }

  if (rows.length > ROW_CAP) {
    return {
      ok: false,
      errors: [structuralError("ROW_CAP_EXCEEDED", { cap: ROW_CAP })],
      rows: [],
    };
  }

  return { ok: true, errors: [], rows, templateVersion };
}

module.exports = { parseWorkbook, ROW_CAP };
