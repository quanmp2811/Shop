/**
 * Tự ghi ngày giờ đăng cho dòng mới trong sheet "BienThe".
 * Cột "Ngày đăng" chỉ được ghi khi đang trống nên thời gian không tự thay đổi.
 */
function onEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== 'BienThe') return;

  const firstDataRow = Math.max(2, e.range.getRow());
  const lastDataRow = e.range.getLastRow();
  if (lastDataRow < 2) return;

  ghiNgayDangChoDongTrong_(sheet, firstDataRow, lastDataRow);
}

/**
 * Chạy thủ công một lần để điền ngày giờ cho các dòng cũ đang bị trống.
 */
function dienNgayDangConThieu() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('BienThe');
  if (!sheet) throw new Error('Không tìm thấy sheet "BienThe".');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  ghiNgayDangChoDongTrong_(sheet, 2, lastRow);
}

function ghiNgayDangChoDongTrong_(sheet, firstRow, lastRow) {
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0]
    .map(function (header) { return String(header).trim(); });

  const variantIdColumn = headers.indexOf('Mã biến thể') + 1;
  const productIdColumn = headers.indexOf('Mã sản phẩm') + 1;
  const postedAtColumn = headers.indexOf('Ngày đăng') + 1;

  if (!variantIdColumn || !productIdColumn || !postedAtColumn) {
    throw new Error(
      'Sheet BienThe phải có các cột: Mã biến thể, Mã sản phẩm và Ngày đăng.'
    );
  }

  const rowCount = lastRow - firstRow + 1;
  const variantIds = sheet
    .getRange(firstRow, variantIdColumn, rowCount, 1)
    .getDisplayValues();
  const productIds = sheet
    .getRange(firstRow, productIdColumn, rowCount, 1)
    .getDisplayValues();
  const postedAtRange = sheet.getRange(firstRow, postedAtColumn, rowCount, 1);
  const postedAtValues = postedAtRange.getValues();
  const now = new Date();
  let hasChanges = false;

  for (let index = 0; index < rowCount; index += 1) {
    const hasProduct = variantIds[index][0] || productIds[index][0];
    const hasPostedAt = postedAtValues[index][0] !== '';

    if (hasProduct && !hasPostedAt) {
      postedAtValues[index][0] = now;
      hasChanges = true;
    }
  }

  if (!hasChanges) return;

  postedAtRange
    .setValues(postedAtValues)
    .setNumberFormat('dd/MM/yyyy HH:mm:ss');
}
