// @ts-ignore
import * as XLSX from 'xlsx';
import { collection, doc, getDocs, query, orderBy, limit, where, writeBatch, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';

export interface PharmacySalesReportMeta {
  id: string;
  fileName: string;
  uploadedAt?: any;
  uploadedBy?: string;
  rowCount: number;
  totalSales: number;
  uniqueClients: number;
  dateStart?: number;
  dateEnd?: number;
  downloadUrl?: string;
  columns?: string[];
}

export interface PharmacySaleRow {
  id?: string;
  dateMs?: number;
  client?: string;
  product?: string;
  quantity?: number;
  total?: number;
  vendor?: string;
  raw?: Record<string, any>;
  normalizedProduct?: string;
  patientName?: string;
  sellerName?: string;
  documentNumber?: number;
  productCode?: string;
  isDiscount?: boolean;
  totalPriceSinIva?: number;
}

export const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const parseNumber = (val: any) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[Q\s,]/g, '').replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
};

/** Guatemala is UTC-6 with no DST. Returns UTC ms for Guatemala midnight of the given Y-M-D. */
const gtMidnightMs = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d, 6, 0, 0, 0);

export const parseFlexibleDate = (val: any): number | undefined => {
  if (!val && val !== 0) return undefined;
  if (val instanceof Date) {
    return gtMidnightMs(val.getFullYear(), val.getMonth() + 1, val.getDate());
  }
  if (typeof val === 'number') {
    if (val < 1) return undefined;
    const parsed = XLSX.SSF.parse_date_code(val);
    if (!parsed || !parsed.y || !parsed.m || !parsed.d) return undefined;
    return gtMidnightMs(parsed.y, parsed.m, parsed.d);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    const ddmmyyyy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ddmmyyyy) {
      return gtMidnightMs(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]), parseInt(ddmmyyyy[1]));
    }
    const yyyymmdd = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (yyyymmdd) {
      return gtMidnightMs(parseInt(yyyymmdd[1]), parseInt(yyyymmdd[2]), parseInt(yyyymmdd[3]));
    }
    const maybe = new Date(trimmed);
    if (!Number.isNaN(maybe.getTime())) {
      return gtMidnightMs(maybe.getFullYear(), maybe.getMonth() + 1, maybe.getDate());
    }
  }
  return undefined;
};

export const findHeaderRow = (rows: any[][]): number => {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] || [];
    const hasFecha = row.some(cell => {
      const s = String(cell || '').toUpperCase().trim();
      return s === 'FECHA DOCUMENTO' || s === 'FECHA DOC' || s === 'FECHA';
    });
    const hasCliente = row.some(cell => {
      const s = String(cell || '').toUpperCase().trim();
      return s.includes('CLIENTE') || s.includes('PACIENTE');
    });
    const hasProducto = row.some(cell => {
      const s = String(cell || '').toUpperCase().trim();
      return s.includes('PRODUCTO') || s.includes('DESCRIPCION') || s.includes('DESCRIPCIÓN');
    });
    if (hasFecha && (hasCliente || hasProducto)) {
      return i;
    }
  }
  return 0;
};

export interface ColumnMap {
  date: number;
  numDoc: number;
  clientCode: number;
  clientName: number;
  clientNameDoc: number;
  clientFactura: number;
  seller: number;
  productCode: number;
  description: number;
  quantity: number;
  precioUnitario: number;
  totalPrecioSinIva: number;
}

export const buildColumnMap = (headers: string[]): ColumnMap => {
  const map: ColumnMap = {
    date: -1,
    numDoc: -1,
    clientCode: -1,
    clientName: -1,
    clientNameDoc: -1,
    clientFactura: -1,
    seller: -1,
    productCode: -1,
    description: -1,
    quantity: -1,
    precioUnitario: -1,
    totalPrecioSinIva: -1,
  };

  headers.forEach((h, idx) => {
    const key = normalizeText(h);
    if (!key) return;

    if (key.includes('fecha') && (key.includes('documento') || key.includes('doc'))) {
      map.date = idx;
    } else if (key.includes('numero') && (key.includes('documento') || key.includes('docum'))) {
      map.numDoc = idx;
    } else if (key.includes('codigo') && key.includes('cliente')) {
      map.clientCode = idx;
    } else if (key.includes('nombre') && key.includes('cliente') && key.includes('documento')) {
      map.clientNameDoc = idx;
    } else if (key.includes('nombre') && key.includes('factura') && key.includes('cliente')) {
      map.clientFactura = idx;
    } else if (key.includes('nombre') && key.includes('cliente')) {
      map.clientName = idx;
    } else if (key.includes('nombre') && (key.includes('vendedor') || key.includes('vende'))) {
      map.seller = idx;
    } else if (key.includes('codigo') && (key.includes('producto') || key.includes('produc'))) {
      map.productCode = idx;
    } else if (key.includes('descripcion') || key.includes('descripción')) {
      map.description = idx;
    } else if (key.includes('cantidad')) {
      map.quantity = idx;
    } else if (key.includes('precio') && key.includes('unitario')) {
      map.precioUnitario = idx;
    } else if (key.includes('total') && key.includes('precio') && key.includes('sin')) {
      map.totalPrecioSinIva = idx;
    }
  });

  return map;
};

export interface ParsePharmacyExcelResult {
  rows: PharmacySaleRow[];
  meta: { totalRows: number; totalSales: number; uniqueClients: number; minDate?: number; maxDate?: number; columns: string[] };
}

export const parsePharmacyExcel = (data: any[][]): ParsePharmacyExcelResult => {
  const headerIndex = findHeaderRow(data);
  const headerRow = data[headerIndex] || [];
  const headers = headerRow.map((h: any) => String(h || '').trim());
  const colMap = buildColumnMap(headers);

  let currentDateMs: number | undefined;
  let currentDoc = { numDoc: 0, clientCode: 0, patientName: '', sellerName: '' };

  const rows: PharmacySaleRow[] = [];
  const clientSet = new Set<string>();
  let totalSales = 0;
  let minDate: number | undefined;
  let maxDate: number | undefined;

  for (let i = headerIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const dateVal = colMap.date >= 0 ? row[colMap.date] : undefined;
    const isDateValue = dateVal !== undefined && dateVal !== '' && (typeof dateVal === 'number' || (typeof dateVal === 'string' && /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(String(dateVal).trim())));
    const rawNumDoc = colMap.numDoc >= 0 ? row[colMap.numDoc] : undefined;
    const rawClientCode = colMap.clientCode >= 0 ? row[colMap.clientCode] : undefined;
    const hasNumDoc = rawNumDoc !== undefined && rawNumDoc !== '' && !String(rawNumDoc).trim().match(/^[a-zA-Z]/);
    const hasClientCode = rawClientCode !== undefined && rawClientCode !== '' && !String(rawClientCode).trim().match(/^[a-zA-Z]/);
    const hasProductCode = colMap.productCode >= 0 && row[colMap.productCode] !== undefined && String(row[colMap.productCode]).trim() !== '';

    if (isDateValue) {
      const parsed = parseFlexibleDate(dateVal);
      if (parsed) {
        currentDateMs = parsed;
        minDate = minDate ? Math.min(minDate, parsed) : parsed;
        maxDate = maxDate ? Math.max(maxDate, parsed) : parsed;
      }
      if (hasNumDoc || hasClientCode) {
        updateCurrentDoc(row, colMap, currentDoc);
      }
      continue;
    }

    if (hasNumDoc || hasClientCode) {
      updateCurrentDoc(row, colMap, currentDoc);
    }

    if (hasProductCode) {
      const productCode = String(row[colMap.productCode] || '').trim();
      const description = colMap.description >= 0 ? String(row[colMap.description] || '').trim() : '';
      const quantity = colMap.quantity >= 0 ? parseNumber(row[colMap.quantity]) : 1;
      const precioUnitario = colMap.precioUnitario >= 0 ? parseNumber(row[colMap.precioUnitario]) : 0;
      const totalSinIva = colMap.totalPrecioSinIva >= 0 ? parseNumber(row[colMap.totalPrecioSinIva]) : 0;

      const patientName = currentDoc.patientName;
      if (patientName) clientSet.add(patientName);

      const saleTotal = totalSinIva || precioUnitario * quantity;
      totalSales += saleTotal;

      rows.push({
        dateMs: currentDateMs || 0,
        client: patientName,
        patientName,
        sellerName: currentDoc.sellerName,
        documentNumber: currentDoc.numDoc,
        productCode,
        product: description || productCode,
        quantity: quantity || 1,
        total: saleTotal,
        vendor: currentDoc.sellerName,
        isDiscount: productCode.toUpperCase() === 'DES',
        totalPriceSinIva: totalSinIva,
        normalizedProduct: normalizeText(description || productCode),
      });
    }
  }

  return {
    rows,
    meta: {
      totalRows: rows.length,
      totalSales,
      uniqueClients: clientSet.size,
      minDate,
      maxDate,
      columns: headers.filter(Boolean),
    },
  };
}

function updateCurrentDoc(row: any[], colMap: ColumnMap, currentDoc: { numDoc: number; clientCode: number; patientName: string; sellerName: string }) {
  if (colMap.numDoc >= 0 && row[colMap.numDoc] !== undefined && String(row[colMap.numDoc]).trim() !== '') {
    const raw = String(row[colMap.numDoc]).trim();
    currentDoc.numDoc = parseInt(raw) || 0;
  }
  if (colMap.clientCode >= 0 && row[colMap.clientCode] !== undefined && String(row[colMap.clientCode]).trim() !== '') {
    currentDoc.clientCode = parseInt(String(row[colMap.clientCode]).trim()) || 0;
  }
  if (colMap.clientName >= 0 && row[colMap.clientName] !== undefined && String(row[colMap.clientName]).trim() !== '') {
    currentDoc.patientName = String(row[colMap.clientName]).trim();
  }
  if (colMap.clientNameDoc >= 0 && row[colMap.clientNameDoc] !== undefined && String(row[colMap.clientNameDoc]).trim() !== '') {
    currentDoc.patientName = String(row[colMap.clientNameDoc]).trim();
  }
  if (colMap.clientFactura >= 0 && row[colMap.clientFactura] !== undefined && String(row[colMap.clientFactura]).trim() !== '') {
    currentDoc.patientName = String(row[colMap.clientFactura]).trim();
  }
  if (colMap.seller >= 0 && row[colMap.seller] !== undefined && String(row[colMap.seller]).trim() !== '') {
    currentDoc.sellerName = String(row[colMap.seller]).trim();
  }
}

export const pharmacySalesService = {
  async uploadReport(file: File, uploadedBy: string, dateStartMs?: number, dateEndMs?: number) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];

    const { rows: rowsData, meta } = parsePharmacyExcel(data);

    const reportRef = doc(collection(db, 'pharmacy_sales_reports'));
    const reportId = reportRef.id;
    const storageRef = ref(storage, `pharmacy_reports/${reportId}/${file.name}`);

    await uploadBytes(storageRef, file);
    const downloadUrl = await getDownloadURL(storageRef);

    const rowsCollection = collection(db, 'pharmacy_sales_reports', reportId, 'rows');
    for (const chunk of rowsData.reduce<PharmacySaleRow[][]>((acc, item, idx) => {
      const chunkIndex = Math.floor(idx / 400);
      if (!acc[chunkIndex]) acc[chunkIndex] = [];
      acc[chunkIndex].push(item);
      return acc;
    }, [])) {
      const chunkBatch = writeBatch(db);
      chunk.forEach((row) => {
        const rowRef = doc(rowsCollection);
        chunkBatch.set(rowRef, row);
      });
      await chunkBatch.commit();
    }

    await setDoc(reportRef, {
      fileName: file.name,
      uploadedBy,
      uploadedAt: serverTimestamp(),
      rowCount: meta.totalRows,
      totalSales: meta.totalSales,
      uniqueClients: meta.uniqueClients,
      dateStart: dateStartMs || meta.minDate || null,
      dateEnd: dateEndMs || meta.maxDate || null,
      downloadUrl,
      columns: meta.columns,
    });

    return { id: reportId, rowCount: meta.totalRows, totalSales: meta.totalSales, uniqueClients: meta.uniqueClients };
  },

  async listReports(): Promise<PharmacySalesReportMeta[]> {
    const snap = await getDocs(query(
      collection(db, 'pharmacy_sales_reports'),
      orderBy('uploadedAt', 'desc'),
      limit(20)
    ));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as PharmacySalesReportMeta));
  },

  async getReportRowsByRange(reportId: string, start?: Date, end?: Date): Promise<PharmacySaleRow[]> {
    const rowsRef = collection(db, 'pharmacy_sales_reports', reportId, 'rows');
    const constraints = [];

    if (start && end) {
      constraints.push(where('dateMs', '>=', start.getTime()));
      constraints.push(where('dateMs', '<=', end.getTime()));
    }

    const snap = await getDocs(constraints.length > 0 ? query(rowsRef, ...constraints) : query(rowsRef));
    const results = snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as PharmacySaleRow));

    if (results.length === 0 && constraints.length > 0) {
      const allSnap = await getDocs(query(rowsRef, limit(1000)));
      return allSnap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as PharmacySaleRow));
    }

    return results;
  }
};
