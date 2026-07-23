import { describe, it, expect } from 'vitest';

/**
 * Tests para la lógica de firma digital y manual de StepFinalize.
 * StepFinalize permite:
 *   - Firma manual (cuando no hay certificado .p12 configurado)
 *   - Firma digital con .p12 (cuando el usuario subió su cert en Ajustes)
 *
 * Extraemos la lógica pura de:
 *   - Detección de tipo de firma disponible
 *   - Cálculo de "missing items" (qué le falta al doctor para finalizar)
 *   - Toggle de firma (firmar / desfirmar)
 */

interface Signature {
  type: 'biometric' | 'digital_token' | 'image' | 'manual' | 'digital_p12';
  url?: string;
  tokenHash?: string;
  signerName?: string;
  signatureDate?: number;
  certificateSerial?: string;
}

interface DigitalCertData {
  fileUrl: string;
  issuedTo: string;
  serialNumber: string;
  issuedBy?: string;
  expiryDate?: string;
}

interface MissingItem {
  key: string;
  label: string;
}

// ----- Lógica pura extraída de StepFinalize -----

/** Determina si el doctor tiene un certificado digital configurado. */
function hasStoredCert(currentUser: { digitalCertData?: DigitalCertData }): boolean {
  return Boolean(currentUser.digitalCertData);
}

/** Devuelve la etiqueta apropiada para la firma según tenga cert o no. */
function getSignatureLabel(currentUser: { digitalCertData?: DigitalCertData }, hasSignature: boolean): string {
  if (hasSignature) return 'Firmado';
  return hasStoredCert(currentUser) ? 'Falta Firmar Digitalmente' : 'Firma Manual Requerida';
}

/** Acción al hacer click en firmar (toggle entre firmar/desfirmar). */
function handleSignClick(
  currentUser: { digitalCertData?: DigitalCertData },
  currentSignature: Signature | null
): { opensPasswordModal: boolean; newSignature: Signature | null; cleared: boolean } {
  if (!hasStoredCert(currentUser)) {
    // Modo firma manual
    if (currentSignature?.type === 'manual') {
      // Click otra vez = desfirmar
      return { opensPasswordModal: false, newSignature: null, cleared: true };
    }
    return { opensPasswordModal: false, newSignature: { type: 'manual' }, cleared: false };
  }

  // Modo firma digital
  if (currentSignature?.type === 'digital_p12') {
    // Click otra vez = desfirmar
    return { opensPasswordModal: false, newSignature: null, cleared: true };
  }
  // Necesita password
  return { opensPasswordModal: true, newSignature: null, cleared: false };
}

/** Construye el objeto de firma digital cuando el password es correcto. */
function buildDigitalSignature(
  currentUser: { digitalCertData?: DigitalCertData }
): Signature {
  return {
    type: 'digital_p12',
    signerName: currentUser.digitalCertData!.issuedTo,
    signatureDate: Date.now(),
    certificateSerial: currentUser.digitalCertData!.serialNumber,
  };
}

/** Calcula los items faltantes para poder finalizar la consulta. */
function getMissingItems(args: {
  diagnosis?: string;
  prescription?: any[];
  prescriptionNotes?: string;
  referralGroups?: any[];
  otherExams?: string;
  referralNote?: string;
  specialtyReferrals?: any[];
  followUpText?: string;
  followUpRequestText?: string;
  signature: Signature | null;
  hasStoredCert: boolean;
}): MissingItem[] {
  const items: MissingItem[] = [];
  if (!args.diagnosis?.trim()) items.push({ key: 'diagnosis', label: 'Sin resumen de consulta' });

  const hasPrescriptionContent =
    (args.prescription && args.prescription.length > 0) ||
    (args.prescriptionNotes && args.prescriptionNotes.trim().length > 0);
  if (!hasPrescriptionContent) items.push({ key: 'prescription', label: 'Sin Receta / Tratamiento' });

  const hasLabs =
    (args.referralGroups?.length || 0) > 0 ||
    (args.otherExams?.trim() || '') !== '' ||
    (args.referralNote?.trim() || '') !== '';
  if (!hasLabs) items.push({ key: 'exams', label: 'Sin Solicitud de Laboratorios' });

  if (!(args.specialtyReferrals?.length || 0)) {
    items.push({ key: 'referrals', label: 'Sin Referencia a Especialistas' });
  }
  if (!args.followUpRequestText?.trim()) {
    items.push({ key: 'nursing', label: 'Sin Anotaciones para Enfermería' });
  }
  if (!args.signature) {
    items.push({ key: 'signature', label: getSignatureLabel({ digitalCertData: args.hasStoredCert ? { fileUrl: '', issuedTo: '', serialNumber: '' } as any : undefined }, false) });
  }
  return items;
}

/** Verifica si una firma es válida para finalizar. */
function isValidSignature(sig: Signature | null | undefined): boolean {
  if (!sig) return false;
  if (sig.type === 'manual') return true;
  if (sig.type === 'digital_p12') {
    return Boolean(sig.signerName && sig.certificateSerial && sig.signatureDate);
  }
  return false;
}

// ----- Tests -----

describe('StepFinalize - hasStoredCert detection', () => {
  it('returns false when digitalCertData is undefined', () => {
    expect(hasStoredCert({})).toBe(false);
    expect(hasStoredCert({ digitalCertData: undefined })).toBe(false);
  });

  it('returns true when digitalCertData is set', () => {
    const cert: DigitalCertData = { fileUrl: 'https://x', issuedTo: 'Dr. X', serialNumber: '123' };
    expect(hasStoredCert({ digitalCertData: cert })).toBe(true);
  });
});

describe('StepFinalize - Signature label', () => {
  it('shows "Firmado" when signature exists', () => {
    expect(getSignatureLabel({ digitalCertData: undefined } as any, true)).toBe('Firmado');
  });

  it('shows "Falta Firmar Digitalmente" when has cert but no signature', () => {
    const cert: DigitalCertData = { fileUrl: 'https://x', issuedTo: 'Dr. X', serialNumber: '123' };
    expect(getSignatureLabel({ digitalCertData: cert }, false)).toBe('Falta Firmar Digitalmente');
  });

  it('shows "Firma Manual Requerida" when no cert and no signature', () => {
    expect(getSignatureLabel({} as any, false)).toBe('Firma Manual Requerida');
  });
});

describe('StepFinalize - handleSignClick (toggle)', () => {
  const userWithCert = { digitalCertData: { fileUrl: 'https://x', issuedTo: 'Dr. X', serialNumber: '123' } };
  const userWithoutCert = { digitalCertData: undefined };

  describe('Without digital cert (manual mode)', () => {
    it('creates manual signature on first click', () => {
      const result = handleSignClick(userWithoutCert as any, null);
      expect(result.newSignature).toEqual({ type: 'manual' });
      expect(result.opensPasswordModal).toBe(false);
      expect(result.cleared).toBe(false);
    });

    it('clears manual signature on second click', () => {
      const result = handleSignClick(userWithoutCert as any, { type: 'manual' });
      expect(result.newSignature).toBeNull();
      expect(result.cleared).toBe(true);
    });
  });

  describe('With digital cert (P12 mode)', () => {
    it('opens password modal on first click', () => {
      const result = handleSignClick(userWithCert as any, null);
      expect(result.opensPasswordModal).toBe(true);
      expect(result.newSignature).toBeNull();
      expect(result.cleared).toBe(false);
    });

    it('clears digital signature on second click', () => {
      const sig: Signature = { type: 'digital_p12', signerName: 'Dr. X', certificateSerial: '123', signatureDate: Date.now() };
      const result = handleSignClick(userWithCert as any, sig);
      expect(result.newSignature).toBeNull();
      expect(result.opensPasswordModal).toBe(false);
      expect(result.cleared).toBe(true);
    });
  });
});

describe('StepFinalize - buildDigitalSignature', () => {
  it('builds signature with issuer data', () => {
    const cert: DigitalCertData = {
      fileUrl: 'https://storage.com/p12',
      issuedTo: 'Dra. María Pérez',
      serialNumber: 'ABC123XYZ',
    };
    const user = { digitalCertData: cert };
    const before = Date.now();
    const sig = buildDigitalSignature(user);
    const after = Date.now();

    expect(sig.type).toBe('digital_p12');
    expect(sig.signerName).toBe('Dra. María Pérez');
    expect(sig.certificateSerial).toBe('ABC123XYZ');
    expect(sig.signatureDate).toBeGreaterThanOrEqual(before);
    expect(sig.signatureDate).toBeLessThanOrEqual(after);
  });
});

describe('StepFinalize - getMissingItems', () => {
  const baseUser = { digitalCertData: undefined };

  it('returns all 6 missing items when everything is empty', () => {
    const items = getMissingItems({
      signature: null,
      hasStoredCert: false,
    });
    expect(items.length).toBe(6);
    expect(items.map(i => i.key)).toEqual(['diagnosis', 'prescription', 'exams', 'referrals', 'nursing', 'signature']);
  });

  it('excludes diagnosis when present', () => {
    const items = getMissingItems({
      diagnosis: 'Epilepsia focal',
      signature: { type: 'manual' },
      hasStoredCert: false,
    });
    expect(items.find(i => i.key === 'diagnosis')).toBeUndefined();
  });

  it('excludes prescription when prescription array is non-empty', () => {
    const items = getMissingItems({
      diagnosis: 'X',
      prescription: [{ medId: '1', name: 'X', quantity: 1, dosage: '', duration_days: '', isExternal: false, units_per_box: 1, presentation: '' }],
      followUpRequestText: 'En 30 días',
      signature: { type: 'manual' },
      hasStoredCert: false,
    });
    expect(items.find(i => i.key === 'prescription')).toBeUndefined();
  });

  it('excludes prescription when prescriptionNotes is filled (even if prescription array is empty)', () => {
    const items = getMissingItems({
      diagnosis: 'X',
      prescription: [],
      prescriptionNotes: 'Reposo absoluto',
      followUpRequestText: 'X',
      signature: { type: 'manual' },
      hasStoredCert: false,
    });
    expect(items.find(i => i.key === 'prescription')).toBeUndefined();
  });

  it('excludes exams when referralGroups is non-empty', () => {
    const items = getMissingItems({
      diagnosis: 'X',
      prescription: [{ medId: '1', name: 'X', quantity: 1, dosage: '', duration_days: '', isExternal: false, units_per_box: 1, presentation: '' }],
      referralGroups: [{ id: 'g1', pathology: 'X', exams: ['a'], note: '' }],
      specialtyReferrals: [{ id: 'r1', specialty: 'Cardiología', note: '' }],
      followUpRequestText: 'X',
      signature: { type: 'manual' },
      hasStoredCert: false,
    });
    expect(items.find(i => i.key === 'exams')).toBeUndefined();
  });

  it('excludes exams when otherExams text is filled', () => {
    const items = getMissingItems({
      diagnosis: 'X',
      prescription: [{ medId: '1', name: 'X', quantity: 1, dosage: '', duration_days: '', isExternal: false, units_per_box: 1, presentation: '' }],
      otherExams: 'EG, Resonancia',
      specialtyReferrals: [{ id: 'r1', specialty: 'Cardiología', note: '' }],
      followUpRequestText: 'X',
      signature: { type: 'manual' },
      hasStoredCert: false,
    });
    expect(items.find(i => i.key === 'exams')).toBeUndefined();
  });

  it('excludes signature when valid signature present', () => {
    const items = getMissingItems({
      diagnosis: 'X',
      prescription: [{ medId: '1', name: 'X', quantity: 1, dosage: '', duration_days: '', isExternal: false, units_per_box: 1, presentation: '' }],
      referralGroups: [{ id: 'g1', pathology: 'X', exams: ['a'], note: '' }],
      specialtyReferrals: [{ id: 'r1', specialty: 'Cardiología', note: '' }],
      followUpRequestText: 'X',
      signature: { type: 'manual' },
      hasStoredCert: false,
    });
    expect(items.find(i => i.key === 'signature')).toBeUndefined();
  });

  it('signature label says "Firma Manual Requerida" when no cert', () => {
    const items = getMissingItems({
      diagnosis: 'X',
      prescription: [{ medId: '1', name: 'X', quantity: 1, dosage: '', duration_days: '', isExternal: false, units_per_box: 1, presentation: '' }],
      referralGroups: [{ id: 'g1', pathology: 'X', exams: ['a'], note: '' }],
      specialtyReferrals: [{ id: 'r1', specialty: 'Cardiología', note: '' }],
      followUpRequestText: 'X',
      signature: null,
      hasStoredCert: false,
    });
    const sigItem = items.find(i => i.key === 'signature');
    expect(sigItem?.label).toBe('Firma Manual Requerida');
  });

  it('signature label says "Falta Firmar Digitalmente" when has cert but no signature', () => {
    const items = getMissingItems({
      diagnosis: 'X',
      prescription: [{ medId: '1', name: 'X', quantity: 1, dosage: '', duration_days: '', isExternal: false, units_per_box: 1, presentation: '' }],
      referralGroups: [{ id: 'g1', pathology: 'X', exams: ['a'], note: '' }],
      specialtyReferrals: [{ id: 'r1', specialty: 'Cardiología', note: '' }],
      followUpRequestText: 'X',
      signature: null,
      hasStoredCert: true,
    });
    const sigItem = items.find(i => i.key === 'signature');
    expect(sigItem?.label).toBe('Falta Firmar Digitalmente');
  });
});

describe('StepFinalize - isValidSignature', () => {
  it('returns false for null', () => {
    expect(isValidSignature(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidSignature(undefined)).toBe(false);
  });

  it('returns true for manual signature', () => {
    expect(isValidSignature({ type: 'manual' })).toBe(true);
  });

  it('returns true for complete digital_p12 signature', () => {
    const sig: Signature = { type: 'digital_p12', signerName: 'Dr. X', certificateSerial: '123', signatureDate: Date.now() };
    expect(isValidSignature(sig)).toBe(true);
  });

  it('returns false for digital_p12 missing signerName', () => {
    const sig: Signature = { type: 'digital_p12', certificateSerial: '123', signatureDate: Date.now() } as any;
    expect(isValidSignature(sig)).toBe(false);
  });

  it('returns false for digital_p12 missing certificateSerial', () => {
    const sig: Signature = { type: 'digital_p12', signerName: 'Dr. X', signatureDate: Date.now() } as any;
    expect(isValidSignature(sig)).toBe(false);
  });

  it('returns false for digital_p12 missing signatureDate', () => {
    const sig: Signature = { type: 'digital_p12', signerName: 'Dr. X', certificateSerial: '123' } as any;
    expect(isValidSignature(sig)).toBe(false);
  });
});
