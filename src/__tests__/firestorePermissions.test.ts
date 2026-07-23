import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Tests para verificar que las reglas de Firestore y Storage permiten
 * a los doctores (rol 'doctor' / 'licenciado') hacer lo que necesitan
 * en el flujo de consulta, sin errores de permisos.
 *
 * NO usamos el emulador de Firebase (eso requeriría setup extra).
 * En su lugar, parseamos el archivo de reglas y validamos estáticamente
 * que las colecciones/paths correctos tienen reglas que permiten a los
 * doctores leer/escribir lo que necesitan.
 */

const FIRESTORE_RULES = fs.readFileSync(
  path.resolve(process.cwd(), 'firestore.rules'),
  'utf-8'
);

const STORAGE_RULES = fs.readFileSync(
  path.resolve(process.cwd(), 'storage.rules'),
  'utf-8'
);

// ---- Helper: extrae los `match /<path>/{param}/...` del archivo de reglas ----

function extractMatchBlocks(rulesSource: string): { path: string; rules: string }[] {
  const blocks: { path: string; rules: string }[] = [];
  // Match: match /path/{param}/... { — greedy on \S captures path with {param}
  const matchRe = /match\s+(\/\S+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = matchRe.exec(rulesSource)) !== null) {
    const path = m[1];
    // Buscar el balance de llaves para extraer el contenido
    let i = matchRe.lastIndex;
    let depth = 1;
    while (i < rulesSource.length && depth > 0) {
      if (rulesSource[i] === '{') depth++;
      else if (rulesSource[i] === '}') depth--;
      i++;
    }
    const content = rulesSource.substring(matchRe.lastIndex, i - 1);
    blocks.push({ path, rules: content });
  }
  return blocks;
}

function getMatchBlock(rulesSource: string, pathPattern: string): { path: string; rules: string } | null {
  const blocks = extractMatchBlocks(rulesSource);
  return blocks.find(b => b.path === pathPattern) || null;
}

// ---- Tests: firestore.rules ----

describe('firestore.rules - Doctors can use the consultation flow', () => {
  describe('Collections read by doctors', () => {
    it('has a rule for patients (read: esPersonal)', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/patients/{patientId}');
      expect(block).not.toBeNull();
      expect(block!.rules).toMatch(/allow\s+read[\s\S]*esPersonal/);
    });

    it('has a rule for consultations (read: esPersonal)', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/consultations/{consultationId}');
      expect(block).not.toBeNull();
      expect(block!.rules).toMatch(/allow\s+read[\s\S]*esPersonal/);
    });

    it('has a rule for appointments (read: esPersonal)', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/appointments/{appointmentId}');
      expect(block).not.toBeNull();
      expect(block!.rules).toMatch(/allow\s+read[\s\S]*esPersonal/);
    });

    it('has a rule for inventory (read: esPersonal)', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/inventory/{itemId}');
      expect(block).not.toBeNull();
      expect(block!.rules).toMatch(/allow\s+read[\s\S]*esPersonal/);
    });

    it('has a rule for external_medicines (read: esPersonal)', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/external_medicines/{itemId}');
      expect(block).not.toBeNull();
      expect(block!.rules).toMatch(/allow\s+read[\s\S]*esPersonal/);
    });

    it('has a rule for pathologies (read: esPersonal)', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/pathologies/{itemId}');
      expect(block).not.toBeNull();
      expect(block!.rules).toMatch(/allow\s+read[\s\S]*esPersonal/);
    });

    it('has a rule for specialties (read: esPersonal)', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/specialties/{itemId}');
      expect(block).not.toBeNull();
      expect(block!.rules).toMatch(/allow\s+read[\s\S]*esPersonal/);
    });

    it('has a rule for laboratory_catalog (read: esPersonal)', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/laboratory_catalog/{itemId}');
      expect(block).not.toBeNull();
      expect(block!.rules).toMatch(/allow\s+read[\s\S]*esPersonal/);
    });

    it('has a rule for med_normalization_rules (read: esPersonal, write: resident or admin)', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/med_normalization_rules/{ruleId}');
      expect(block).not.toBeNull();
      expect(block!.rules).toMatch(/allow\s+read[\s\S]*esPersonal/);
      expect(block!.rules).toMatch(/allow\s+write[\s\S]*tieneRol\('resident'\)\s*\|\|\s*tieneRol\('admin'\)/);
    });

    it('has a rule for prescription_reviews (any authenticated can read, resident/admin can update)', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/prescription_reviews/{reviewId}');
      expect(block).not.toBeNull();
      expect(block!.rules).toMatch(/allow\s+read[\s\S]*estaAutenticado/);
      expect(block!.rules).toMatch(/allow\s+update[\s\S]*tieneRol\('resident'\)/);
    });

    it('has a rule for quality_reviews (now esPersonal read+write)', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/quality_reviews/{reviewId}');
      expect(block).not.toBeNull();
      expect(block!.rules).toMatch(/allow\s+read,\s*write[\s\S]*esPersonal/);
    });

    it('has a rule for clinics (read: esPersonal)', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/clinics/{itemId}');
      expect(block).not.toBeNull();
      expect(block!.rules).toMatch(/allow\s+read[\s\S]*esPersonal/);
    });

    it('has a rule for notifications (read: esPersonal)', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/notifications/{notifId}');
      expect(block).not.toBeNull();
      expect(block!.rules).toMatch(/allow\s+read[\s\S]*esPersonal/);
    });
  });

  describe('Collections written by doctors', () => {
    it('doctors can write consultations', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/consultations/{consultationId}');
      expect(block!.rules).toMatch(/allow\s+read,\s*write[\s\S]*esPersonal/);
    });

    it('doctors can write appointments', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/appointments/{appointmentId}');
      expect(block!.rules).toMatch(/allow\s+read,\s*write[\s\S]*esPersonal/);
    });

    it('doctors can write external_medicines (for StepExams autosave)', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/external_medicines/{itemId}');
      // Rule uses separate allow read: / allow write: lines (not combined)
      expect(block!.rules).toMatch(/allow\s+read:[\s\S]*esPersonal/);
      expect(block!.rules).toMatch(/allow\s+write:[\s\S]*esPersonal/);
    });

    it('doctors CANNOT write inventory (only admin can)', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/inventory/{itemId}');
      // write must require esAdmin, not esPersonal
      expect(block!.rules).toMatch(/allow\s+write[\s\S]*esAdmin/);
      expect(block!.rules).not.toMatch(/allow\s+read,\s*write[\s\S]*esPersonal/);
    });

    it('doctors CANNOT write pharmacy_sales_reports (only admin can)', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/pharmacy_sales_reports/{reportId}');
      expect(block!.rules).toMatch(/allow\s+read,\s*write[\s\S]*esAdmin/);
    });
  });

  describe('Self-management permissions (doctors updating own data)', () => {
    it('doctors can update their own user document', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/users/{userId}');
      expect(block).not.toBeNull();
      // The rule uses "allow update:" with the condition (esAdmin() with parens)
      expect(block!.rules).toMatch(/esAdmin\(\)\s*\|\|\s*request\.auth\.uid\s*==\s*userId/);
    });

    it('doctors can read the users collection', () => {
      const block = getMatchBlock(FIRESTORE_RULES, '/users/{userId}');
      expect(block!.rules).toMatch(/allow\s+read[\s\S]*estaAutenticado/);
    });
  });
});

describe('firestore.rules - Critical security checks', () => {
  it('audit_logs cannot be deleted by anyone', () => {
    const block = getMatchBlock(FIRESTORE_RULES, '/audit_logs/{logId}');
    expect(block).not.toBeNull();
    expect(block!.rules).toMatch(/delete:\s*if\s*false/);
  });

  it('audit_logs can be created by staff', () => {
    const block = getMatchBlock(FIRESTORE_RULES, '/audit_logs/{logId}');
    expect(block!.rules).toMatch(/allow\s+create[\s\S]*esPersonal/);
  });

  it('system_settings is admin only', () => {
    const block = getMatchBlock(FIRESTORE_RULES, '/system_settings/{docId}');
    expect(block!.rules).toMatch(/allow\s+read,\s*write[\s\S]*esAdmin/);
  });

  it('rules_version is declared as 2', () => {
    expect(FIRESTORE_RULES).toMatch(/rules_version\s*=\s*['"]2['"]/);
  });
});

// ---- Tests: storage.rules ----

describe('storage.rules - Doctors can read their P12 certificate', () => {
  it('rules_version is declared as 2', () => {
    expect(STORAGE_RULES).toMatch(/rules_version\s*=\s*['"]2['"]/);
  });

  it('has a rule for certificates path', () => {
    const block = getMatchBlock(STORAGE_RULES, '/certificates/{userId}/{fileName}');
    expect(block).not.toBeNull();
  });

  it('doctors can READ their own certificate files', () => {
    const block = getMatchBlock(STORAGE_RULES, '/certificates/{userId}/{fileName}');
    expect(block!.rules).toMatch(/allow\s+read[\s\S]*request\.auth\.uid\s*==\s*userId/);
  });

  it('doctors can WRITE (upload) their own certificate files', () => {
    const block = getMatchBlock(STORAGE_RULES, '/certificates/{userId}/{fileName}');
    expect(block!.rules).toMatch(/allow\s+write[\s\S]*request\.auth\.uid\s*==\s*userId/);
  });

  it('doctors CANNOT read OTHER users certificates', () => {
    const block = getMatchBlock(STORAGE_RULES, '/certificates/{userId}/{fileName}');
    // Must require uid match
    expect(block!.rules).toMatch(/request\.auth\.uid\s*==\s*userId/);
  });

  it('pharmacy_reports path is accessible by any authenticated user (admin uploads, staff reads)', () => {
    const block = getMatchBlock(STORAGE_RULES, '/pharmacy_reports/{reportId}/{fileName}');
    expect(block).not.toBeNull();
    expect(block!.rules).toMatch(/allow\s+read,\s*write[\s\S]*request\.auth\s*!=\s*null/);
  });

  it('has Firebase Storage service declaration', () => {
    expect(STORAGE_RULES).toMatch(/service\s+firebase\.storage/);
  });
});

describe('firestore.rules - Files exist', () => {
  it('firestore.rules file exists and is not empty', () => {
    expect(FIRESTORE_RULES.length).toBeGreaterThan(0);
  });

  it('storage.rules file exists and is not empty', () => {
    expect(STORAGE_RULES.length).toBeGreaterThan(0);
  });

  it('firebase.json references both rules files', () => {
    const firebaseJson = fs.readFileSync(
      path.resolve(process.cwd(), 'firebase.json'),
      'utf-8'
    );
    expect(firebaseJson).toMatch(/"firestore"[\s\S]*"rules":\s*"firestore\.rules"/);
    expect(firebaseJson).toMatch(/"storage"[\s\S]*"rules":\s*"storage\.rules"/);
  });
});
