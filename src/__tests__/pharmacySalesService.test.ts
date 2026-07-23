import { describe, it, expect } from 'vitest';
import {
  parsePharmacyExcel,
  parseFlexibleDate,
  findHeaderRow,
  buildColumnMap,
  normalizeText,
  parseNumber,
} from '../services/pharmacySalesService';

describe('normalizeText', () => {
  it('removes accents and lowercases', () => {
    expect(normalizeText('ACETAMINOFÉN')).toBe('acetaminofen');
    expect(normalizeText('María del Carmen')).toBe('maria del carmen');
  });

  it('trims whitespace', () => {
    expect(normalizeText('  hello  ')).toBe('hello');
  });
});

describe('parseNumber', () => {
  it('parses plain numbers', () => {
    expect(parseNumber(42)).toBe(42);
    expect(parseNumber(3.14)).toBeCloseTo(3.14);
  });

  it('parses string numbers', () => {
    expect(parseNumber('100')).toBe(100);
    expect(parseNumber('1,500')).toBe(1500);
  });

  it('returns 0 for empty/null', () => {
    expect(parseNumber(null)).toBe(0);
    expect(parseNumber(undefined)).toBe(0);
    expect(parseNumber('')).toBe(0);
  });
});

describe('parseFlexibleDate', () => {
  it('parses Excel serial date numbers', () => {
    const ms = parseFlexibleDate(46150);
    expect(ms).toBeDefined();
    const date = new Date(ms!);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(8);
  });

  it('parses DD/MM/YYYY strings', () => {
    const ms = parseFlexibleDate('02/06/2026');
    expect(ms).toBeDefined();
    const date = new Date(ms!);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(2);
  });

  it('parses YYYY-MM-DD strings', () => {
    const ms = parseFlexibleDate('2026-05-15');
    expect(ms).toBeDefined();
    const date = new Date(ms!);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(15);
  });

  it('returns undefined for invalid dates', () => {
    expect(parseFlexibleDate('')).toBeUndefined();
    expect(parseFlexibleDate(undefined)).toBeUndefined();
  });
});

describe('findHeaderRow', () => {
  it('finds header row with FECHA DOCUMENTO', () => {
    const rows = [
      ['Reporte dinámico de ventas'],
      [],
      ['Total by ROWS'],
      ['FECHA DOCUMENTO', 'NUMERO DOCUMENTO', 'CODIGO CLIENTE', 'NOMBRE CLIENTE'],
    ];
    expect(findHeaderRow(rows)).toBe(3);
  });

  it('finds header row with FECHA DOC', () => {
    const rows = [
      [],
      ['Title'],
      ['FECHA DOC', 'CLIENTE', 'PRODUCTO'],
    ];
    expect(findHeaderRow(rows)).toBe(2);
  });

  it('returns 0 if no header found', () => {
    const rows = [['data'], ['more data']];
    expect(findHeaderRow(rows)).toBe(0);
  });
});

describe('buildColumnMap', () => {
  it('maps May Excel columns correctly', () => {
    const headers = [
      'FECHA DOCUMENTO', 'NUMERO DOCUMENTO', 'CODIGO CLIENTE',
      'NOMBRE CLIENTE', 'NOMBRE CLIENTE DOCUMENTO', 'NOMBRE FACTURA CLIENTE',
      'NOMBRE VENDEDOR', 'CODIGO PRODUCTO', 'DESCRIPCION PRODUCTO',
      'CANTIDAD INVENTARIO', 'COSTO PROMEDIO UNITARIO', 'COSTO UNITARIO ULTIMO',
      'PRECIO UNITARIO', 'TOTAL COSTO PROMEDIO', 'TOTAL PRECIO SIN IVA', 'TOTAL ULTIMO COSTO',
    ];
    const map = buildColumnMap(headers);
    expect(map.date).toBe(0);
    expect(map.numDoc).toBe(1);
    expect(map.clientCode).toBe(2);
    expect(map.clientName).toBe(3);
    expect(map.clientNameDoc).toBe(4);
    expect(map.clientFactura).toBe(5);
    expect(map.seller).toBe(6);
    expect(map.productCode).toBe(7);
    expect(map.description).toBe(8);
    expect(map.quantity).toBe(9);
    expect(map.precioUnitario).toBe(12);
    expect(map.totalPrecioSinIva).toBe(14);
  });

  it('maps June Excel columns correctly (swapped NUM_DOC and COD_CLIENTE)', () => {
    const headers = [
      'FECHA DOCUMENTO', 'CODIGO CLIENTE', 'NOMBRE CLIENTE',
      'NOMBRE CLIENTE DOCUMENTO', 'NOMBRE FACTURA CLIENTE',
      'NUMERO DOCUMENTO', 'NOMBRE VENDEDOR', 'CODIGO PRODUCTO',
      'DESCRIPCION PRODUCTO', 'CANTIDAD INVENTARIO',
      'COSTO PROMEDIO UNITARIO', 'COSTO UNITARIO ULTIMO',
      'PRECIO UNITARIO', 'TOTAL COSTO PROMEDIO', 'TOTAL PRECIO SIN IVA', 'TOTAL ULTIMO COSTO',
    ];
    const map = buildColumnMap(headers);
    expect(map.date).toBe(0);
    expect(map.clientCode).toBe(1);
    expect(map.clientName).toBe(2);
    expect(map.numDoc).toBe(5);
    expect(map.seller).toBe(6);
    expect(map.productCode).toBe(7);
    expect(map.quantity).toBe(9);
  });
});

describe('parsePharmacyExcel - May format', () => {
  const mayData = [
    ['Reporte dinámico de ventas'],
    [],
    ['Total by ROWS'],
    ['FECHA DOCUMENTO', 'NUMERO DOCUMENTO', 'CODIGO CLIENTE', 'NOMBRE CLIENTE', 'NOMBRE CLIENTE DOCUMENTO', 'NOMBRE FACTURA CLIENTE', 'NOMBRE VENDEDOR', 'CODIGO PRODUCTO', 'DESCRIPCION PRODUCTO', 'CANTIDAD INVENTARIO', 'COSTO PROMEDIO UNITARIO', 'COSTO UNITARIO ULTIMO', 'PRECIO UNITARIO', 'TOTAL COSTO PROMEDIO', 'TOTAL PRECIO SIN IVA', 'TOTAL ULTIMO COSTO'],
    ['Value', 'Value', 'Value'],
    [46150],
    ['', 19782, 13306, 'RAMIREZ ESTRADA EDGAR ROBERTO', 'RAMIREZ ESTRADA EDGAR ROBERTO', 'RAMIREZ ESTRADA EDGAR ROBERTO', 'Juan Carlos Lara Girón'],
    ['', '', '', '', '', '', '', 'FAR00026', 'Etiretam 1000 Mg', 2, 195.45, 195.45, 308, 390.91, 616, 390.91],
    ['', '', '', '', '', '', '', 'DES', '', 1, 0, 0, 0, 0, 0, 0],
    ['', 19780, 13306, 'RAMIREZ ESTRADA EDGAR ROBERTO', 'RAMIREZ ESTRADA EDGAR ROBERTO', 'RAMIREZ ESTRADA EDGAR ROBERTO', 'Juan Carlos Lara Girón'],
    ['', '', '', '', '', '', '', 'FAR00010', 'Ceumid Xr 1000 Mg', 1, 100, 100, 150, 100, 150, 100],
  ];

  it('parses May format correctly', () => {
    const result = parsePharmacyExcel(mayData);
    expect(result.rows.length).toBe(3);
    expect(result.meta.totalRows).toBe(3);
  });

  it('extracts patient name from document rows', () => {
    const result = parsePharmacyExcel(mayData);
    const etiretam = result.rows.find(r => r.productCode === 'FAR00026');
    expect(etiretam).toBeDefined();
    expect(etiretam!.patientName).toBe('RAMIREZ ESTRADA EDGAR ROBERTO');
    expect(etiretam!.sellerName).toBe('Juan Carlos Lara Girón');
    expect(etiretam!.documentNumber).toBe(19782);
  });

  it('extracts dates correctly', () => {
    const result = parsePharmacyExcel(mayData);
    const date = new Date(result.rows[0].dateMs!);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(8);
  });

  it('marks DES rows as discounts', () => {
    const result = parsePharmacyExcel(mayData);
    const des = result.rows.find(r => r.productCode === 'DES');
    expect(des).toBeDefined();
    expect(des!.isDiscount).toBe(true);
  });

  it('does not mark FAR rows as discounts', () => {
    const result = parsePharmacyExcel(mayData);
    const far = result.rows.find(r => r.productCode === 'FAR00026');
    expect(far!.isDiscount).toBe(false);
  });

  it('calculates totalSales', () => {
    const result = parsePharmacyExcel(mayData);
    expect(result.meta.totalSales).toBeGreaterThan(0);
  });
});

describe('parsePharmacyExcel - June format', () => {
  const juneData = [
    [],
    ['Reporte dinámico de ventas'],
    [],
    ['Total by ROWS'],
    ['FECHA DOCUMENTO', 'CODIGO CLIENTE', 'NOMBRE CLIENTE', 'NOMBRE CLIENTE DOCUMENTO', 'NOMBRE FACTURA CLIENTE', 'NUMERO DOCUMENTO', 'NOMBRE VENDEDOR', 'CODIGO PRODUCTO', 'DESCRIPCION PRODUCTO', 'CANTIDAD INVENTARIO', 'COSTO PROMEDIO UNITARIO', 'COSTO UNITARIO ULTIMO', 'PRECIO UNITARIO', 'TOTAL COSTO PROMEDIO', 'TOTAL PRECIO SIN IVA', 'TOTAL ULTIMO COSTO'],
    ['Value', 'Value', 'Value'],
    ['02/06/2026', '', '', '', '', '', '', '', '', '', '', '', '', 6192.28, 50617.3, 9539.84],
    ['', '13415', 'VILLANUEVA OSORIO ISMAEL AMADEO', '', '', '', '', '', '', '', '', '', '', 42.09, 30903.3, 430],
    ['', '', 'ISMAEL VILLANUEVA', 'VILLANUEVA OSORIO ISMAEL AMADEO', '', '20460', 'Juan Carlos Lara Girón', '', '', '', '', '', '', '', 29103.3, ''],
    ['', '', '', '', '', '', '', 'CIR006', 'Cirugía Colocación de Valvula', 1, 0, 0, 29103.3, 0, 29103.3, 0],
    ['', '', '', '', '', '', '', 'DES', '', 1, 0, 0, 0, 0, 0, 0],
    ['', '', '', '', '', '20502', 'Juan Carlos Lara Girón', '', '', '', '', '', '', '', 896.7, ''],
    ['', '', '', '', '', '', '', 'CIR006', 'Cirugía Colocación de Valvula', 1, 0, 0, 896.7, 0, 896.7, 0],
    ['', '', '', '', '', '', '', 'DES', '', 1, 0, 0, 0, 0, 0, 0],
    ['', '', '', '', '', '20504', 'Juan Carlos Lara Girón', '', '', '', '', '', '', 42.09, 903.3, 430],
    ['', '', '', '', '', '', '', 'DES', '', 1, 0, 0, 0, 0, 0, 0],
    ['', '', '', '', '', '', '', 'FAR00096', 'Flamydol 75 Mg', 1, 42.09, 0, 51.3, 42.09, 51.3, 0],
    ['', '', '', '', '', '', '', 'LAB0027', 'Creatinina', 1, 0, 20, 40, 0, 40, 20],
    ['00013', 'AREVALO NAVAS MARIA JOSE', 'AREVALO NAVAS MARIA JOSE', 'AREVALO NAVAS MARIA JOSE', 'AREVALO NAVAS MARIA JOSE', '20478', 'Abel Alejandro Sanabria Sanchinel', '', '', '', '', '', '', 171.34, 241, 132.59],
    ['', '', '', '', '', '', '', 'DES', '', 1, 0, 0, 0, 0, 0, 0],
    ['', '', '', '', '', '', '', 'FAR00023', 'Equiliv 2 Mg', 1, 85.65, 66.07, 123, 85.65, 123, 66.07],
  ];

  it('parses June format correctly', () => {
    const result = parsePharmacyExcel(juneData);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('extracts date from DD/MM/YYYY string', () => {
    const result = parsePharmacyExcel(juneData);
    expect(result.rows.length).toBeGreaterThan(0);
    const date = new Date(result.rows[0].dateMs!);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(2);
  });

  it('accumulates client info across rows', () => {
    const result = parsePharmacyExcel(juneData);
    const farRow = result.rows.find(r => r.productCode === 'FAR00096');
    expect(farRow).toBeDefined();
    expect(farRow!.patientName).toBe('VILLANUEVA OSORIO ISMAEL AMADEO');
    expect(farRow!.sellerName).toBe('Juan Carlos Lara Girón');
  });

  it('handles NUMERO DOCUMENTO with leading spaces', () => {
    const result = parsePharmacyExcel(juneData);
    const firstDoc = result.rows.find(r => r.documentNumber === 20460);
    expect(firstDoc).toBeDefined();
  });

  it('handles combined client+doc row', () => {
    const result = parsePharmacyExcel(juneData);
    const equiliv = result.rows.find(r => r.productCode === 'FAR00023');
    expect(equiliv).toBeDefined();
    expect(equiliv!.patientName).toBe('AREVALO NAVAS MARIA JOSE');
    expect(equiliv!.documentNumber).toBe(20478);
    expect(equiliv!.sellerName).toBe('Abel Alejandro Sanabria Sanchinel');
  });
});

describe('parsePharmacyExcel - Real May Excel file', () => {
  it('parses the real May Excel file', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const XLSX = await import('xlsx');

    const filePath = path.resolve(process.cwd(), 'Reporte del 01 al 31 de mayo de 2026.xlsx');
    if (!fs.existsSync(filePath)) {
      console.log('Skipping real May Excel test - file not found at', filePath);
      return;
    }

    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];

    const result = parsePharmacyExcel(data);

    expect(result.rows.length).toBeGreaterThan(2000);
    expect(result.meta.uniqueClients).toBeGreaterThan(400);
    expect(result.meta.minDate).toBeDefined();
    expect(result.meta.maxDate).toBeDefined();

    const firstProduct = result.rows[0];
    expect(firstProduct.patientName).toBeTruthy();
    expect(firstProduct.productCode).toBeTruthy();
    expect(firstProduct.sellerName).toBeTruthy();
    expect(firstProduct.dateMs).toBeGreaterThan(0);

    const discounts = result.rows.filter(r => r.isDiscount);
    expect(discounts.length).toBeGreaterThan(0);

    const medications = result.rows.filter(r => r.productCode?.startsWith('FAR'));
    expect(medications.length).toBeGreaterThan(0);
  });

  it('verifies exact counts and date range for real May Excel', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const XLSX = await import('xlsx');

    const filePath = path.resolve(process.cwd(), 'Reporte del 01 al 31 de mayo de 2026.xlsx');
    if (!fs.existsSync(filePath)) return;

    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];

    const result = parsePharmacyExcel(data);

    // Counts must match Excel totals exactly
    const medications = result.rows.filter(r => r.productCode?.startsWith('FAR') && !r.isDiscount);
    const totalMedicationItems = medications.reduce((a, b) => a + (b.quantity || 1), 0);
    expect(medications.length).toBe(466); // 466 FAR rows
    expect(totalMedicationItems).toBe(739); // 739 items (sum of Cantidad)

    const discounts = result.rows.filter(r => r.isDiscount);
    expect(discounts.length).toBe(764); // 764 DES rows

    // Date range must be 2026-05-04 to 2026-05-30 (Guatemala)
    const minDate = new Date(result.meta.minDate!);
    const maxDate = new Date(result.meta.maxDate!);
    // Date is stored as Guatemala midnight UTC = 06:00 UTC
    // When read in test environment (likely UTC), getUTCDate returns the day
    // When read in Guatemala, getDate() returns the day
    expect(minDate.getUTCFullYear()).toBe(2026);
    expect(minDate.getUTCMonth()).toBe(4); // May (0-indexed)
    expect(minDate.getUTCDate()).toBe(4);
    expect(maxDate.getUTCFullYear()).toBe(2026);
    expect(maxDate.getUTCMonth()).toBe(4);
    expect(maxDate.getUTCDate()).toBe(30);
  });

  it('verifies Guatemala timezone consistency for parsed dates', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const XLSX = await import('xlsx');

    const filePath = path.resolve(process.cwd(), 'Reporte del 01 al 31 de mayo de 2026.xlsx');
    if (!fs.existsSync(filePath)) return;

    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];

    const result = parsePharmacyExcel(data);

    // All dateMs values should be Guatemala midnight UTC (= 06:00:00.000Z)
    result.rows.filter(r => r.dateMs).forEach(r => {
      const d = new Date(r.dateMs!);
      // Should be 06:00:00 UTC (which is midnight in Guatemala UTC-6)
      expect(d.getUTCHours()).toBe(6);
      expect(d.getUTCMinutes()).toBe(0);
      expect(d.getUTCSeconds()).toBe(0);
    });
  });
});

describe('parsePharmacyExcel - Real June Excel file', () => {
  it('parses the real June Excel file', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const XLSX = await import('xlsx');

    const filePath = path.resolve(process.cwd(), 'del01al23deJunio2026.xlsx');
    if (!fs.existsSync(filePath)) {
      console.log('Skipping real June Excel test - file not found at', filePath);
      return;
    }

    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];

    const result = parsePharmacyExcel(data);

    expect(result.rows.length).toBeGreaterThan(1000);
    expect(result.meta.uniqueClients).toBeGreaterThan(300);

    const firstProduct = result.rows[0];
    expect(firstProduct.patientName).toBeTruthy();
    expect(firstProduct.productCode).toBeTruthy();

    const dates = new Set(result.rows.filter(r => r.dateMs).map(r => {
      const d = new Date(r.dateMs!);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }));
    expect(dates.size).toBeGreaterThan(10);
  });
});
