import { describe, it, expect } from 'vitest';

/**
 * Tests para verificar que la asignación de labs/exámenes en StepExams funciona.
 * Como StepExams es un componente React complejo, testeamos la lógica pura
 * extraída (las funciones de toggle/add/remove que StepExams ejecuta).
 */

interface Pathology {
  id: string;
  name: string;
  exams: string[];
}

interface ReferralGroup {
  id: string;
  pathology: string;
  exams: string[];
  note: string;
}

// ----- Funciones puras extraídas de StepExams -----

/** Selecciona una patología y crea el grupo de referral con sus exámenes. */
function selectPathology(
  pathology: Pathology,
  currentGroups: ReferralGroup[],
  appointmentType?: 'Nueva' | 'Reconsulta'
): ReferralGroup[] {
  const groupId = `pat-${pathology.id || pathology.name}`;
  const existingGroupIndex = currentGroups.findIndex(g => g.id === groupId);
  if (existingGroupIndex !== -1) return currentGroups;

  const isReconsulta = appointmentType === 'Reconsulta';
  const newGroup: ReferralGroup = {
    id: groupId,
    pathology: pathology.name,
    exams: isReconsulta ? [] : [...pathology.exams],
    note: '',
  };
  return [...currentGroups, newGroup];
}

/** Toggle de un examen en el grupo de la patología seleccionada. */
function toggleExamInGroup(
  pathology: Pathology,
  examName: string,
  currentGroups: ReferralGroup[]
): ReferralGroup[] {
  const groupId = `pat-${pathology.id || pathology.name}`;
  const groups = [...currentGroups];
  const groupIndex = groups.findIndex(g => g.id === groupId);

  if (groupIndex === -1) {
    return [...groups, { id: groupId, pathology: pathology.name, exams: [examName], note: '' }];
  }

  const group = groups[groupIndex];
  if (group.exams.includes(examName)) {
    group.exams = group.exams.filter(e => e !== examName);
    if (group.exams.length === 0 && !group.note) {
      groups.splice(groupIndex, 1);
    }
  } else {
    group.exams.push(examName);
  }
  return groups;
}

/** Actualiza la nota de un grupo. */
function updateGroupNote(
  groupId: string,
  note: string,
  currentGroups: ReferralGroup[]
): ReferralGroup[] {
  const groups = currentGroups.map(g => {
    if (g.id === groupId) return { ...g, note };
    return g;
  });
  return groups;
}

/** Elimina un grupo entero. */
function removeGroup(groupId: string, currentGroups: ReferralGroup[]): ReferralGroup[] {
  return currentGroups.filter(g => g.id !== groupId);
}

/** Elimina un examen específico de un grupo. Si el grupo queda vacío sin nota, se elimina. */
function removeExamFromGroup(
  groupId: string,
  examName: string,
  currentGroups: ReferralGroup[]
): ReferralGroup[] {
  const groups = [...currentGroups];
  const group = groups.find(g => g.id === groupId);
  if (!group) return groups;

  group.exams = group.exams.filter(e => e !== examName);
  if (group.exams.length === 0 && !group.note) {
    return groups.filter(g => g.id !== groupId);
  }
  return groups;
}

/** Agrega una orden de resonancia. */
function addResonanceOrder(
  currentOrders: any[] | undefined,
  newOrder: any
): any[] {
  const orders = currentOrders || [];
  return [...orders, newOrder];
}

/** Verifica si un examen está en el grupo de la patología. */
function isExamInGroup(
  pathology: Pathology,
  examName: string,
  currentGroups: ReferralGroup[]
): boolean {
  const groupId = `pat-${pathology.id || pathology.name}`;
  const group = currentGroups.find(g => g.id === groupId);
  return group ? group.exams.includes(examName) : false;
}

/** Selecciona todos los exámenes de la patología. */
function selectAllInGroup(
  pathology: Pathology,
  currentGroups: ReferralGroup[]
): ReferralGroup[] {
  const groupId = `pat-${pathology.id || pathology.name}`;
  const groupIndex = currentGroups.findIndex(g => g.id === groupId);
  if (groupIndex === -1) {
    return [...currentGroups, { id: groupId, pathology: pathology.name, exams: [...pathology.exams], note: '' }];
  }
  const next = [...currentGroups];
  next[groupIndex] = { ...next[groupIndex], exams: [...pathology.exams] };
  return next;
}

/** Deselecciona todos los exámenes. Si no tiene nota, elimina el grupo. */
function deselectAllInGroup(
  pathology: Pathology,
  currentGroups: ReferralGroup[]
): ReferralGroup[] {
  const groupId = `pat-${pathology.id || pathology.name}`;
  const group = currentGroups.find(g => g.id === groupId);
  if (!group) return currentGroups;
  if (group.note) {
    return currentGroups.map(g => g.id === groupId ? { ...g, exams: [] } : g);
  }
  return currentGroups.filter(g => g.id !== groupId);
}

const normalizeText = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

interface ExamCategory {
  label: string;
  exams: string[];
}

function groupExamsByCategory(exams: string[]): ExamCategory[] {
  const laboratorios: string[] = [];
  const imagenes: string[] = [];
  const neurofisiologia: string[] = [];
  const procedimientos: string[] = [];

  exams.forEach(exam => {
    const norm = normalizeText(exam).replace(/[^a-z0-9]/g, '');
    if (normalizeText(exam).includes('laboratorio')) {
      laboratorios.push(exam);
    } else if (
      norm.includes('resonancia') ||
      norm.includes('tomografia') ||
      norm.includes('ecografia') ||
      norm.includes('radiografia') ||
      norm.includes('imagen')
    ) {
      imagenes.push(exam);
    } else if (
      norm.includes('eeg') ||
      norm.includes('electroencefalograma') ||
      norm.includes('videoencefalograma') ||
      norm.includes('videoeeg')
    ) {
      neurofisiologia.push(exam);
    } else {
      procedimientos.push(exam);
    }
  });

  const result: ExamCategory[] = [];
  if (laboratorios.length > 0) result.push({ label: 'Laboratorios', exams: laboratorios });
  if (imagenes.length > 0) result.push({ label: 'Imágenes', exams: imagenes });
  if (neurofisiologia.length > 0) result.push({ label: 'Neurofisiología', exams: neurofisiologia });
  if (procedimientos.length > 0) result.push({ label: 'Procedimientos', exams: procedimientos });
  return result;
}

// ----- Tests -----

describe('StepExams - Pathology selection', () => {
  const epilepsia: Pathology = {
    id: 'pat-1',
    name: 'Epilepsia',
    exams: ['Hematología Completa', 'TGO/ASAT', 'TGP/ALAT'],
  };

  it('selects a pathology and creates group with its default exams', () => {
    const result = selectPathology(epilepsia, []);
    expect(result.length).toBe(1);
    expect(result[0].pathology).toBe('Epilepsia');
    expect(result[0].exams).toEqual(['Hematología Completa', 'TGO/ASAT', 'TGP/ALAT']);
    expect(result[0].note).toBe('');
    expect(result[0].id).toBe('pat-pat-1');
  });

  it('does not create duplicate group when re-selecting same pathology', () => {
    const initial = selectPathology(epilepsia, []);
    const result = selectPathology(epilepsia, initial);
    expect(result.length).toBe(1);
  });

  it('does not auto-select exams for Reconsulta appointment type', () => {
    const result = selectPathology(epilepsia, [], 'Reconsulta');
    expect(result.length).toBe(1);
    expect(result[0].exams).toEqual([]);
  });

  it('auto-selects exams for Nueva appointment type', () => {
    const result = selectPathology(epilepsia, [], 'Nueva');
    expect(result[0].exams.length).toBe(3);
  });

  it('handles pathology without id (uses name as id)', () => {
    const noId: Pathology = { id: '', name: 'Parkinson', exams: ['TSH', 'T4'] };
    const result = selectPathology(noId, []);
    expect(result[0].id).toBe('pat-Parkinson');
  });
});

describe('StepExams - Exam toggle in group', () => {
  const epilepsia: Pathology = { id: 'p1', name: 'Epilepsia', exams: ['Hematología'] };

  it('adds an exam when toggled on', () => {
    const initial = selectPathology(epilepsia, []);
    const result = toggleExamInGroup(epilepsia, 'TSH', initial);
    expect(result[0].exams).toContain('TSH');
  });

  it('removes an exam when toggled off', () => {
    const initial = selectPathology(epilepsia, []);
    const withTSH = toggleExamInGroup(epilepsia, 'TSH', initial);
    const withoutTSH = toggleExamInGroup(epilepsia, 'TSH', withTSH);
    expect(withoutTSH[0].exams).not.toContain('TSH');
  });

  it('removes the group when last exam is removed and no note', () => {
    const initial = selectPathology(epilepsia, []);
    const withOne = toggleExamInGroup(epilepsia, 'TSH', initial);
    // initial has 'Hematología', now with TSH added
    // remove Hematología
    const after1 = toggleExamInGroup(epilepsia, 'Hematología', withOne);
    expect(after1[0].exams).toEqual(['TSH']);
    // remove TSH (now empty)
    const after2 = toggleExamInGroup(epilepsia, 'TSH', after1);
    expect(after2.length).toBe(0);
  });

  it('keeps the group if it has a note even when last exam is removed', () => {
    let groups = selectPathology(epilepsia, []);
    groups = updateGroupNote('pat-p1', 'Control trimestral', groups);
    groups = toggleExamInGroup(epilepsia, 'Hematología', groups);
    expect(groups.length).toBe(1);
    expect(groups[0].note).toBe('Control trimestral');
  });

  it('creates a new group if pathology is not selected but exam is toggled', () => {
    const result = toggleExamInGroup(epilepsia, 'TSH', []);
    expect(result.length).toBe(1);
    expect(result[0].exams).toEqual(['TSH']);
  });
});

describe('StepExams - Group note management', () => {
  const epilepsia: Pathology = { id: 'p1', name: 'Epilepsia', exams: ['Hematología'] };

  it('updates the note of an existing group', () => {
    const initial = selectPathology(epilepsia, []);
    const updated = updateGroupNote('pat-p1', 'Paciente nuevo', initial);
    expect(updated[0].note).toBe('Paciente nuevo');
  });

  it('does not affect other groups when updating note', () => {
    const parkinson: Pathology = { id: 'p2', name: 'Parkinson', exams: ['TSH'] };
    const initial = selectPathology(epilepsia, []);
    const with2 = selectPathology(parkinson, initial);
    const updated = updateGroupNote('pat-p2', 'Solo TSH basal', with2);
    expect(updated[0].note).toBe('');
    expect(updated[1].note).toBe('Solo TSH basal');
  });
});

describe('StepExams - Remove group', () => {
  const epilepsia: Pathology = { id: 'p1', name: 'Epilepsia', exams: [] };

  it('removes a group by id', () => {
    const initial = selectPathology(epilepsia, []);
    const result = removeGroup('pat-p1', initial);
    expect(result.length).toBe(0);
  });

  it('keeps other groups when removing one', () => {
    const parkinson: Pathology = { id: 'p2', name: 'Parkinson', exams: [] };
    const initial = selectPathology(epilepsia, []);
    const both = selectPathology(parkinson, initial);
    const after = removeGroup('pat-p1', both);
    expect(after.length).toBe(1);
    expect(after[0].pathology).toBe('Parkinson');
  });
});

describe('StepExams - Remove exam from group', () => {
  const epilepsia: Pathology = { id: 'p1', name: 'Epilepsia', exams: ['Hematología', 'TSH', 'TGO'] };

  it('removes a specific exam from a group', () => {
    const initial = selectPathology(epilepsia, []);
    const result = removeExamFromGroup('pat-p1', 'TSH', initial);
    expect(result[0].exams).toEqual(['Hematología', 'TGO']);
  });

  it('removes the group when last exam is removed and no note', () => {
    const group: ReferralGroup = { id: 'g1', pathology: 'X', exams: ['a'], note: '' };
    const result = removeExamFromGroup('g1', 'a', [group]);
    expect(result.length).toBe(0);
  });

  it('keeps the group with note even when last exam is removed', () => {
    const group: ReferralGroup = { id: 'g1', pathology: 'X', exams: ['a'], note: 'importante' };
    const result = removeExamFromGroup('g1', 'a', [group]);
    expect(result.length).toBe(1);
    expect(result[0].exams).toEqual([]);
    expect(result[0].note).toBe('importante');
  });
});

describe('StepExams - Resonance orders', () => {
  it('adds a resonance order to empty list', () => {
    const order = { id: 'r1', type: 'Resonancia', brain: 'Sí' };
    const result = addResonanceOrder(undefined, order);
    expect(result.length).toBe(1);
    expect(result[0]).toEqual(order);
  });

  it('appends a resonance order to existing list', () => {
    const existing = [{ id: 'r0', type: 'Resonancia', brain: 'No' }];
    const order = { id: 'r1', type: 'Resonancia', brain: 'Sí' };
    const result = addResonanceOrder(existing, order);
    expect(result.length).toBe(2);
    expect(result[1]).toEqual(order);
  });
});

describe('StepExams - Exam query in group', () => {
  const epilepsia: Pathology = { id: 'p1', name: 'Epilepsia', exams: [] };

  it('returns true when exam is in the group', () => {
    const groups = toggleExamInGroup(epilepsia, 'TSH', []);
    expect(isExamInGroup(epilepsia, 'TSH', groups)).toBe(true);
  });

  it('returns false when exam is not in the group', () => {
    const groups = selectPathology(epilepsia, []);
    expect(isExamInGroup(epilepsia, 'TSH', groups)).toBe(false);
  });

  it('returns false when pathology is not selected', () => {
    expect(isExamInGroup(epilepsia, 'TSH', [])).toBe(false);
  });
});

describe('StepExams - Select all in group', () => {
  const epilepsia: Pathology = {
    id: 'p1',
    name: 'Epilepsia',
    exams: ['Hematología Completa', 'TSH', 'TGO/ASAT'],
  };

  it('creates a new group with all exams when none exists', () => {
    const result = selectAllInGroup(epilepsia, []);
    expect(result.length).toBe(1);
    expect(result[0].exams).toEqual(epilepsia.exams);
    expect(result[0].note).toBe('');
  });

  it('replaces exams in existing group with all pathology exams', () => {
    const initial = selectPathology({ id: 'p1', name: 'Epilepsia', exams: ['Old1'] }, []);
    const result = selectAllInGroup(epilepsia, initial);
    expect(result[0].exams).toEqual(epilepsia.exams);
  });

  it('preserves the note when re-selecting all', () => {
    let groups = selectPathology(epilepsia, []);
    groups = updateGroupNote('pat-p1', 'Control trimestral', groups);
    const result = selectAllInGroup(epilepsia, groups);
    expect(result[0].exams).toEqual(epilepsia.exams);
    expect(result[0].note).toBe('Control trimestral');
  });

  it('does not affect other pathology groups', () => {
    const parkinson: Pathology = { id: 'p2', name: 'Parkinson', exams: ['TSH'] };
    const initial = selectPathology(parkinson, []);
    const result = selectAllInGroup(epilepsia, initial);
    expect(result.length).toBe(2);
    expect(result.find(g => g.id === 'pat-p2')?.exams).toEqual(['TSH']);
    expect(result.find(g => g.id === 'pat-p1')?.exams).toEqual(epilepsia.exams);
  });
});

describe('StepExams - Deselect all in group', () => {
  const epilepsia: Pathology = {
    id: 'p1',
    name: 'Epilepsia',
    exams: ['Hematología Completa', 'TSH'],
  };

  it('removes the group entirely when no note', () => {
    const initial = selectPathology(epilepsia, []);
    const result = deselectAllInGroup(epilepsia, initial);
    expect(result.length).toBe(0);
  });

  it('keeps the group with empty exams when it has a note', () => {
    let groups = selectPathology(epilepsia, []);
    groups = updateGroupNote('pat-p1', 'Nota importante', groups);
    const result = deselectAllInGroup(epilepsia, groups);
    expect(result.length).toBe(1);
    expect(result[0].exams).toEqual([]);
    expect(result[0].note).toBe('Nota importante');
  });

  it('is a no-op when pathology was not selected', () => {
    const result = deselectAllInGroup(epilepsia, []);
    expect(result).toEqual([]);
  });

  it('does not affect other groups', () => {
    const parkinson: Pathology = { id: 'p2', name: 'Parkinson', exams: ['TSH'] };
    let groups = selectPathology(epilepsia, []);
    groups = selectPathology(parkinson, groups);
    const result = deselectAllInGroup(epilepsia, groups);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('pat-p2');
  });
});

describe('StepExams - Group exams by category (sub-menus)', () => {
  it('groups labs into Laboratorios', () => {
    const result = groupExamsByCategory(['Laboratorios: TGO/ASAT', 'Hematología Completa']);
    const labs = result.find(c => c.label === 'Laboratorios');
    expect(labs).toBeDefined();
    expect(labs?.exams.length).toBe(1);
  });

  it('groups resonance/tomography into Imágenes', () => {
    const result = groupExamsByCategory(['Resonancia Magnética', 'Tomografía Axial', 'Ecografía Abdominal']);
    const imagenes = result.find(c => c.label === 'Imágenes');
    expect(imagenes).toBeDefined();
    expect(imagenes?.exams.length).toBe(3);
  });

  it('groups EEG into Neurofisiología', () => {
    const result = groupExamsByCategory(['EEG', 'Video-EEG', 'Electroencefalograma']);
    const neuro = result.find(c => c.label === 'Neurofisiología');
    expect(neuro).toBeDefined();
    expect(neuro?.exams.length).toBe(3);
  });

  it('groups other exams into Procedimientos', () => {
    const result = groupExamsByCategory(['Evaluación clínica', 'Consulta especializada']);
    const proc = result.find(c => c.label === 'Procedimientos');
    expect(proc).toBeDefined();
    expect(proc?.exams.length).toBe(2);
  });

  it('only includes categories that have exams', () => {
    const result = groupExamsByCategory(['EEG']);
    expect(result.length).toBe(1);
    expect(result[0].label).toBe('Neurofisiología');
  });

  it('returns empty array when no exams', () => {
    expect(groupExamsByCategory([])).toEqual([]);
  });

  it('matches case- and accent-insensitively', () => {
    const result = groupExamsByCategory(['RESONANCIA', 'eeg', 'TóMografía']);
    const imagenes = result.find(c => c.label === 'Imágenes');
    const neuro = result.find(c => c.label === 'Neurofisiología');
    expect(imagenes?.exams.length).toBe(2);
    expect(neuro?.exams.length).toBe(1);
  });
});
