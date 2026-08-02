function doGet(e) {
  const sku = e.parameter.sku;
  //const sheetName = e.parameter.sheet;
  const sheetNameParam = e.parameter.sheet.trim().toLowerCase();
  

  if (!sku || !sheetNameParam) {
    return jsonError("INVALID_PARAM");
  }

  const ss = SpreadsheetApp.getActive();
  //const sheet = ss.getSheetByName(sheetName);
  const sheet = ss.getSheets().find(s => s.getName().trim().toLowerCase() === sheetNameParam);
  if (!sheet) return jsonError("SHEET_NOT_FOUND");

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === sku) {
      return jsonSuccess({
        sheet: sheetNameParam,
        sku,
        qty: data[i][3],       // D 컬럼
        upc: data[i][4],       // E 컬럼
        location: data[i][9]   // J 컬럼
      });
    }
  }

  return jsonError("NOT_FOUND");
}

// JSON 성공 응답
function jsonSuccess(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// JSON 에러 응답
function jsonError(code) {
  return ContentService
    .createTextOutput(JSON.stringify({ error: code }))
    .setMimeType(ContentService.MimeType.JSON);
}

