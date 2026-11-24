import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '../data/WEBSITE.xlsx');
const wb = XLSX.readFile(filePath);
console.log('Sheet Names:', wb.SheetNames);

wb.SheetNames.forEach(sheetName => {
  console.log(`\n=================== SHEET: ${sheetName} ===================`);
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  rows.forEach((row, i) => {
    const clean = row.map(c => (c !== undefined && c !== null ? String(c).trim() : '')).filter(Boolean);
    if (clean.length > 0) {
      console.log(`Row ${i + 1}:`, JSON.stringify(row));
    }
  });
});
