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
}

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const parseNumber = (val: any) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[Q\s,]/g, '').replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
};

const parseExcelDate = (val: any): number | undefined => {
  if (!val && val !== 0) return undefined;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number') {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (!parsed || !parsed.y || !parsed.m || !parsed.d) return undefined;
    const date = new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0);
    return date.getTime();
  }
  if (typeof val === 'string') {
    const maybe = new Date(val);
    if (!Number.isNaN(maybe.getTime())) return maybe.getTime();
  }
  return undefined;
};

const findHeaderRow = (rows: any[][]) => {
  const keywords = ['CLIENTE', 'PRODUCTO', 'FECHA', 'FECHA DOC', 'DESCRIPCION', 'DESCRIPCIÓN'];
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i] || [];
    const rowStr = row.map(cell => String(cell || '').toUpperCase()).join(' ');
    if (keywords.some(k => rowStr.includes(k))) {
      return i;
    }
  }
  return 0;
};

const buildColumnMap = (headers: string[]) => {
  const map: Record<string, number> = {};
  headers.forEach((h, idx) => {
    const key = normalizeText(h);
    if (key.includes('fecha')) map.date = idx;
    if (key.includes('cliente') || key.includes('paciente') || key.includes('nombre')) map.client = idx;
    if (key.includes('producto') || key.includes('descripcion') || key.includes('descripción') || key.includes('articulo') || key.includes('artículo')) map.product = idx;
    if (key.includes('cantidad') || key.includes('cant.') || key.includes('unidades')) map.quantity = idx;
    if (key.includes('total') || key.includes('importe') || key.includes('monto') || key.includes('venta')) map.total = idx;
    if (key.includes('vendedor') || key.includes('doctor') || key.includes('medico') || key.includes('médico')) map.vendor = idx;
  });
  return map;
};

export const pharmacySalesService = {
  async uploadReport(file: File, uploadedBy: string) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
    const headerIndex = findHeaderRow(rows);
    const headerRow = rows[headerIndex] || [];
    const headers = headerRow.map((h: any) => String(h || '').trim());
    const colMap = buildColumnMap(headers);

    const reportRef = doc(collection(db, 'pharmacy_sales_reports'));
    const reportId = reportRef.id;
    const storageRef = ref(storage, `pharmacy_reports/${reportId}/${file.name}`);

    await uploadBytes(storageRef, file);
    const downloadUrl = await getDownloadURL(storageRef);

    let rowCount = 0;
    let totalSales = 0;
    const clientSet = new Set<string>();
    let minDate: number | undefined;
    let maxDate: number | undefined;

    const rowsData: PharmacySaleRow[] = [];
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const product = String(row[colMap.product] || '').trim();
      const client = String(row[colMap.client] || '').trim();
      const quantity = parseNumber(row[colMap.quantity]);
      const total = parseNumber(row[colMap.total]);
      const dateMs = parseExcelDate(row[colMap.date]);
      const vendor = String(row[colMap.vendor] || '').trim();

      if (!product && !client) continue;

      if (client) clientSet.add(client);
      if (dateMs) {
        minDate = minDate ? Math.min(minDate, dateMs) : dateMs;
        maxDate = maxDate ? Math.max(maxDate, dateMs) : dateMs;
      }

      totalSales += total;
      rowCount++;

      rowsData.push({
        dateMs: dateMs || 0,
        client: client || '',
        product: product || '',
        quantity: quantity || 0,
        total: total || 0,
        vendor: vendor || '',
        raw: headers.reduce((acc, h, idx) => {
          if (h) acc[h] = row[idx] !== undefined ? row[idx] : null;
          return acc;
        }, {} as Record<string, any>),
        normalizedProduct: normalizeText(product || '')
      });
    }

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
      rowCount,
      totalSales,
      uniqueClients: clientSet.size,
      dateStart: minDate || null,
      dateEnd: maxDate || null,
      downloadUrl,
      columns: headers.filter(Boolean)
    });

    return { id: reportId, rowCount, totalSales, uniqueClients: clientSet.size };
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
    
    // Solo aplicar filtro de fecha si dateMs no es 0 (filas sin fecha)
    // Si no se pasan fechas, traemos todo
    if (start && end) {
      constraints.push(where('dateMs', '>=', start.getTime()));
      constraints.push(where('dateMs', '<=', end.getTime()));
    }
    
    const snap = await getDocs(constraints.length > 0 ? query(rowsRef, ...constraints) : query(rowsRef));
    const results = snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as PharmacySaleRow));
    
    // Si el filtro de fecha devolvió 0 pero sabemos que hay filas, intentamos traer todo
    // Esto es útil si el Excel no tenía fechas válidas y se guardaron como 0
    if (results.length === 0 && constraints.length > 0) {
      const allSnap = await getDocs(query(rowsRef, limit(1000)));
      return allSnap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as PharmacySaleRow));
    }

    return results;
  }
};
