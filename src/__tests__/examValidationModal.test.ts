import { describe, it, expect } from 'vitest';
import { EegOrder, ResonanceOrder, ReferralGroup } from '../types';

const isFilled = (v: any) => typeof v === 'string' && v.trim().length > 0;

const normalizeText = (text: string) =>
    text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const LAB_PROTOCOLS: Record<string, { title: string; items: string[] }[]> = {
    epilepsia: [
        { title: 'Prueba', items: ['Hematología Completa + VS'] },
        { title: 'Pruebas de Función Hepática', items: ['TGO/ASAT', 'TGP/ALAT', 'GGT', 'Amonio', 'Fosfatasa alcalina', 'Albumina', 'Bilirrubina directa', 'Bilirrubina indirecta', 'Bilirrubina total', 'Coagulación (TP, TTP, INR)'] },
        { title: 'Química Sanguínea', items: ['Glucosa pre', 'Creatinina', 'BUN', 'Na+/K+ CL (Sodio, Potasio, Cloruro)', 'Ácido úrico'] },
        { title: 'Niveles séricos de medicamentos', items: ['Ácido valproico', 'Fenitoína', 'Carbamazepina', 'Carbonato de litio'] },
        { title: 'Perfil Lipídico', items: ['Triglicéridos', 'Colesterol', 'HDL', 'VLDL'] },
        { title: 'Otros exámenes', items: ['Grupo Sanguíneo', 'Orina completa', 'Heces simples', 'Hemoglobina glicosilada', 'Electrocardiograma', 'T3', 'T4', 'TSH', 'Otros'] }
    ],
    parkinson: [
        { title: 'Glucosa y Metabolismo', items: ['Glucosa pre', 'Glucosa post', 'Hemoglobina glicosilada'] },
        { title: 'Función Hepática', items: ['TGO/ASAT', 'TGP/ALAT', 'GGT'] },
        { title: 'Tiroides', items: ['TSH', 'T4 libre'] },
        { title: 'Vitaminas', items: ['Vitamina D', 'Vitamina B12'] },
        { title: 'Orina', items: ['Orina completa'] }
    ]
};

interface LabCompletion { complete: boolean; total: number; done: number }
interface OrderCompletion { complete: boolean; total: number; done: number }

function getProtocolKey(pathologyName: string): string {
    return normalizeText(pathologyName).includes('parkinson') ? 'parkinson' : 'epilepsia';
}

function computeLabCompletion(referralGroups: ReferralGroup[]): LabCompletion {
    const labGroups = referralGroups.filter(g =>
        g.exams.some(e => normalizeText(e).includes('laboratorio'))
    );
    if (labGroups.length === 0) return { complete: true, total: 0, done: 0 };
    let total = 0;
    let done = 0;
    labGroups.forEach(group => {
        const protocolKey = getProtocolKey(group.pathology);
        const groups = LAB_PROTOCOLS[protocolKey];
        const selected = new Set(
            group.exams.filter(e => e.startsWith('Laboratorios:')).map(e => e.replace('Laboratorios: ', ''))
        );
        groups.forEach(g => g.items.forEach(item => {
            total++;
            if (selected.has(item)) done++;
        }));
    });
    return { complete: done === total, total, done };
}

function computeResonanceCompletion(orders: ResonanceOrder[]): OrderCompletion {
    if (orders.length === 0) return { complete: true, total: 0, done: 0 };
    const total = orders.length;
    const done = orders.filter(o => isFilled(o.probableDiagnosis)).length;
    return { complete: done === total, total, done };
}

function computeEegCompletion(orders: EegOrder[]): OrderCompletion {
    if (orders.length === 0) return { complete: true, total: 0, done: 0 };
    const total = orders.length;
    const done = orders.filter(o => isFilled(o.probableDiagnosis) && isFilled(o.duration)).length;
    return { complete: done === total, total, done };
}

function computeEmotionalCompletion(emotionalEvaluationSelections: string[]): { complete: boolean } {
    if (emotionalEvaluationSelections.length === 0) return { complete: false };
    return { complete: true };
}

function needsValidationModal(referralGroups: ReferralGroup[], optionalExams: string[]): boolean {
    const allExams: string[] = [];
    referralGroups.forEach(group => group.exams.forEach(exam => allExams.push(exam)));
    optionalExams.forEach((exam: string) => allExams.push(exam));
    const unique = Array.from(new Set(allExams));
    const hasResonance = unique.some(exam => normalizeText(exam).includes('resonancia'));
    const hasEeg = unique.some(exam => {
        const norm = normalizeText(exam).replace(/[^a-z0-9]/g, '');
        return norm.includes('eeg') || norm.includes('electroencefalograma') || norm.includes('videoencefalograma') || norm.includes('videoeeg');
    });
    const hasEmotional = unique.some(exam => normalizeText(exam).includes('evaluacion emocional'));
    const hasLabs = unique.some(exam => normalizeText(exam).includes('laboratorio'));
    return hasResonance || hasEeg || hasEmotional || hasLabs;
}

function toggleProtocolLab(referralGroups: ReferralGroup[], groupId: string, labName: string): ReferralGroup[] {
    const next = referralGroups.map(g => {
        if (g.id !== groupId) return g;
        const tag = `Laboratorios: ${labName}`;
        const has = g.exams.includes(tag);
        return { ...g, exams: has ? g.exams.filter(e => e !== tag) : [...g.exams, tag] };
    });
    return next;
}

function isProtocolLabSelected(referralGroups: ReferralGroup[], groupId: string, labName: string): boolean {
    const group = referralGroups.find(g => g.id === groupId);
    return group ? group.exams.includes(`Laboratorios: ${labName}`) : false;
}

function selectAllLabsInProtocol(referralGroups: ReferralGroup[], groupId: string): ReferralGroup[] {
    return referralGroups.map(g => {
        if (g.id !== groupId) return g;
        const protocolKey = getProtocolKey(g.pathology);
        const groups = LAB_PROTOCOLS[protocolKey];
        const allTags: string[] = [];
        groups.forEach(group => group.items.forEach(item => allTags.push(`Laboratorios: ${item}`)));
        const filtered = g.exams.filter(e => !e.startsWith('Laboratorios:'));
        return { ...g, exams: [...filtered, ...allTags] };
    });
}

function deselectAllLabsInProtocol(referralGroups: ReferralGroup[], groupId: string): ReferralGroup[] {
    return referralGroups.map(g => {
        if (g.id !== groupId) return g;
        return { ...g, exams: g.exams.filter(e => !e.startsWith('Laboratorios:')) };
    });
}

function isAllLabsSelected(referralGroups: ReferralGroup[], groupId: string): boolean {
    const group = referralGroups.find(g => g.id === groupId);
    if (!group) return false;
    const protocolKey = getProtocolKey(group.pathology);
    const groups = LAB_PROTOCOLS[protocolKey];
    const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);
    const selectedCount = group.exams.filter(e => e.startsWith('Laboratorios:')).length;
    return totalItems > 0 && selectedCount === totalItems;
}

function updateResonanceOrder(orders: ResonanceOrder[], idx: number, field: keyof ResonanceOrder, value: string): ResonanceOrder[] {
    const next = [...orders];
    next[idx] = { ...next[idx], [field]: value };
    return next;
}

function addResonanceOrder(orders: ResonanceOrder[]): ResonanceOrder[] {
    const defaultExam = orders[0]?.examName || 'Resonancia Magnética';
    return [
        ...orders,
        {
            examName: defaultExam,
            probableDiagnosis: '',
            attentionNotes: '',
            sendResultsTo: 'Oficinas Zona 10'
        }
    ];
}

function removeResonanceOrder(orders: ResonanceOrder[], idx: number): ResonanceOrder[] {
    return orders.filter((_, i) => i !== idx);
}

function updateEegOrder(orders: EegOrder[], idx: number, field: keyof EegOrder, value: any): EegOrder[] {
    const next = [...orders];
    next[idx] = { ...next[idx], [field]: value };
    return next;
}

function addEegOrder(orders: EegOrder[]): EegOrder[] {
    const defaultExam = orders[0]?.examName || 'EEG';
    return [
        ...orders,
        {
            examName: defaultExam,
            probableDiagnosis: '',
            duration: '1 hora',
            cctcg: false,
            cpc: false,
            cpcSecGeneralizadas: false,
            ausencias: false,
            crisisMioclonicas: false,
            crisisEstaticas: false,
            specialIndications: '',
            medicatedWith: '',
            videoMonitoringHours: '',
            videoMonitoringSleepDeprivation: 'No',
            ictalVideoHours: '',
            ictalSleepDeprivation: 'No',
            spikeDetection64: false,
            spikeDetection128: false,
            spikeDetectionHours: '',
            p300: false
        }
    ];
}

function removeEegOrder(orders: EegOrder[], idx: number): EegOrder[] {
    return orders.filter((_, i) => i !== idx);
}

describe('ExamValidationModal - needsValidationModal', () => {
    it('returns false when no exams are selected', () => {
        expect(needsValidationModal([], [])).toBe(false);
    });

    it('returns true when labs are selected', () => {
        const groups: ReferralGroup[] = [{
            id: 'g1', pathology: 'Epilepsia',
            exams: ['Laboratorios: Hematología Completa + VS']
        }];
        expect(needsValidationModal(groups, [])).toBe(true);
    });

    it('returns true when resonance is selected', () => {
        expect(needsValidationModal([], ['Resonancia Magnética'])).toBe(true);
    });

    it('returns true when EEG is selected', () => {
        expect(needsValidationModal([], ['EEG de rutina'])).toBe(true);
    });

    it('returns true when evaluacion emocional is selected', () => {
        expect(needsValidationModal([], ['Evaluación Emocional'])).toBe(true);
    });

    it('returns false for non-validated exams like consultation', () => {
        expect(needsValidationModal([], ['Consulta general'])).toBe(false);
    });

    it('detects case- and accent-insensitively', () => {
        expect(needsValidationModal([], ['RESONANCIA Magnética'])).toBe(true);
        expect(needsValidationModal([], ['eeg'])).toBe(true);
    });
});

describe('ExamValidationModal - lab completion', () => {
    it('returns complete=true when no labs', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: ['Hematología'] }];
        const result = computeLabCompletion(groups);
        expect(result.complete).toBe(true);
        expect(result.total).toBe(0);
    });

    it('counts all protocol items as total', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: ['Laboratorios: Hematología Completa + VS'] }];
        const result = computeLabCompletion(groups);
        const expectedTotal = LAB_PROTOCOLS.epilepsia.reduce((s, g) => s + g.items.length, 0);
        expect(result.total).toBe(expectedTotal);
        expect(result.done).toBe(1);
    });

    it('is complete only when all items selected', () => {
        const protocolKey = 'epilepsia';
        const allItems = LAB_PROTOCOLS[protocolKey].flatMap(g => g.items);
        const allTags = allItems.map(item => `Laboratorios: ${item}`);
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: allTags }];
        const result = computeLabCompletion(groups);
        expect(result.complete).toBe(true);
        expect(result.done).toBe(result.total);
    });

    it('uses parkinson protocol for parkinson pathology', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Parkinson', exams: ['Laboratorios: Glucosa pre'] }];
        const result = computeLabCompletion(groups);
        const expectedTotal = LAB_PROTOCOLS.parkinson.reduce((s, g) => s + g.items.length, 0);
        expect(result.total).toBe(expectedTotal);
    });

    it('handles multiple pathology groups', () => {
        const groups: ReferralGroup[] = [
            { id: 'g1', pathology: 'Epilepsia', exams: ['Laboratorios: Hematología Completa + VS'] },
            { id: 'g2', pathology: 'Parkinson', exams: ['Laboratorios: TSH'] }
        ];
        const result = computeLabCompletion(groups);
        expect(result.total).toBe(LAB_PROTOCOLS.epilepsia.reduce((s, g) => s + g.items.length, 0) + LAB_PROTOCOLS.parkinson.reduce((s, g) => s + g.items.length, 0));
        expect(result.done).toBe(2);
    });
});

describe('ExamValidationModal - resonance completion', () => {
    it('returns complete=true when no orders', () => {
        expect(computeResonanceCompletion([]).complete).toBe(true);
    });

    it('is incomplete when probableDiagnosis is empty', () => {
        const orders: ResonanceOrder[] = [{ examName: 'RM Cerebral', probableDiagnosis: '' }];
        const result = computeResonanceCompletion(orders);
        expect(result.complete).toBe(false);
        expect(result.done).toBe(0);
    });

    it('is complete when probableDiagnosis is filled', () => {
        const orders: ResonanceOrder[] = [{ examName: 'RM Cerebral', probableDiagnosis: 'Epilepsia' }];
        const result = computeResonanceCompletion(orders);
        expect(result.complete).toBe(true);
        expect(result.done).toBe(1);
    });

    it('handles whitespace-only probableDiagnosis as incomplete', () => {
        const orders: ResonanceOrder[] = [{ examName: 'RM', probableDiagnosis: '   ' }];
        const result = computeResonanceCompletion(orders);
        expect(result.complete).toBe(false);
    });

    it('counts only complete orders', () => {
        const orders: ResonanceOrder[] = [
            { examName: 'RM1', probableDiagnosis: 'A' },
            { examName: 'RM2', probableDiagnosis: '' },
            { examName: 'RM3', probableDiagnosis: 'C' }
        ];
        const result = computeResonanceCompletion(orders);
        expect(result.total).toBe(3);
        expect(result.done).toBe(2);
        expect(result.complete).toBe(false);
    });
});

describe('ExamValidationModal - eeg completion', () => {
    it('returns complete=true when no orders', () => {
        expect(computeEegCompletion([]).complete).toBe(true);
    });

    it('is incomplete when duration missing', () => {
        const orders: EegOrder[] = [{ examName: 'EEG', probableDiagnosis: 'Epilepsia', duration: '' }];
        expect(computeEegCompletion(orders).complete).toBe(false);
    });

    it('is incomplete when probableDiagnosis missing', () => {
        const orders: EegOrder[] = [{ examName: 'EEG', probableDiagnosis: '', duration: '1 hora' }];
        expect(computeEegCompletion(orders).complete).toBe(false);
    });

    it('is complete when both filled', () => {
        const orders: EegOrder[] = [{ examName: 'EEG', probableDiagnosis: 'Epilepsia', duration: '1 hora' }];
        expect(computeEegCompletion(orders).complete).toBe(true);
    });
});

describe('ExamValidationModal - emotional completion', () => {
    it('is incomplete when no specialties selected', () => {
        expect(computeEmotionalCompletion([]).complete).toBe(false);
    });

    it('is complete when at least one selected', () => {
        expect(computeEmotionalCompletion(['Psicología']).complete).toBe(true);
    });
});

describe('ExamValidationModal - toggleProtocolLab', () => {
    it('adds lab to group', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: [] }];
        const result = toggleProtocolLab(groups, 'g1', 'Hematología Completa + VS');
        expect(result[0].exams).toContain('Laboratorios: Hematología Completa + VS');
    });

    it('removes lab from group', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: ['Laboratorios: Hematología Completa + VS'] }];
        const result = toggleProtocolLab(groups, 'g1', 'Hematología Completa + VS');
        expect(result[0].exams).not.toContain('Laboratorios: Hematología Completa + VS');
    });

    it('preserves other groups', () => {
        const groups: ReferralGroup[] = [
            { id: 'g1', pathology: 'Epilepsia', exams: [] },
            { id: 'g2', pathology: 'Parkinson', exams: [] }
        ];
        const result = toggleProtocolLab(groups, 'g1', 'Hematología Completa + VS');
        expect(result[0].exams.length).toBe(1);
        expect(result[1].exams.length).toBe(0);
    });

    it('isProtocolLabSelected returns true when selected', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: ['Laboratorios: Hematología Completa + VS'] }];
        expect(isProtocolLabSelected(groups, 'g1', 'Hematología Completa + VS')).toBe(true);
    });

    it('isProtocolLabSelected returns false when not selected', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: [] }];
        expect(isProtocolLabSelected(groups, 'g1', 'Hematología Completa + VS')).toBe(false);
    });

    it('isProtocolLabSelected returns false for non-existent group', () => {
        expect(isProtocolLabSelected([], 'g1', 'Hematología Completa + VS')).toBe(false);
    });
});

describe('ExamValidationModal - selectAllLabsInProtocol', () => {
    it('selects all labs in epilepsia protocol', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: [] }];
        const result = selectAllLabsInProtocol(groups, 'g1');
        const expected = LAB_PROTOCOLS.epilepsia.reduce((s, g) => s + g.items.length, 0);
        expect(result[0].exams.length).toBe(expected);
    });

    it('uses parkinson protocol for parkinson pathology', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Parkinson', exams: [] }];
        const result = selectAllLabsInProtocol(groups, 'g1');
        const expected = LAB_PROTOCOLS.parkinson.reduce((s, g) => s + g.items.length, 0);
        expect(result[0].exams.length).toBe(expected);
    });

    it('preserves non-lab exams', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: ['Hematología'] }];
        const result = selectAllLabsInProtocol(groups, 'g1');
        expect(result[0].exams).toContain('Hematología');
        const labCount = result[0].exams.filter(e => e.startsWith('Laboratorios:')).length;
        expect(labCount).toBe(LAB_PROTOCOLS.epilepsia.reduce((s, g) => s + g.items.length, 0));
    });

    it('does not affect other groups', () => {
        const groups: ReferralGroup[] = [
            { id: 'g1', pathology: 'Epilepsia', exams: [] },
            { id: 'g2', pathology: 'Parkinson', exams: [] }
        ];
        const result = selectAllLabsInProtocol(groups, 'g1');
        expect(result[0].exams.length).toBeGreaterThan(0);
        expect(result[1].exams.length).toBe(0);
    });
});

describe('ExamValidationModal - deselectAllLabsInProtocol', () => {
    it('removes all lab tags from group', () => {
        const groups: ReferralGroup[] = [{
            id: 'g1', pathology: 'Epilepsia',
            exams: ['Laboratorios: Hematología Completa + VS', 'Laboratorios: TGO/ASAT', 'Hematología']
        }];
        const result = deselectAllLabsInProtocol(groups, 'g1');
        expect(result[0].exams).toEqual(['Hematología']);
    });

    it('is no-op when no labs are selected', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: ['Hematología'] }];
        const result = deselectAllLabsInProtocol(groups, 'g1');
        expect(result[0].exams).toEqual(['Hematología']);
    });

    it('does not affect other groups', () => {
        const groups: ReferralGroup[] = [
            { id: 'g1', pathology: 'Epilepsia', exams: ['Laboratorios: Hematología Completa + VS'] },
            { id: 'g2', pathology: 'Parkinson', exams: ['Laboratorios: TSH'] }
        ];
        const result = deselectAllLabsInProtocol(groups, 'g1');
        expect(result[0].exams).toEqual([]);
        expect(result[1].exams).toEqual(['Laboratorios: TSH']);
    });

    it('is no-op for non-existent group', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: [] }];
        const result = deselectAllLabsInProtocol(groups, 'g99');
        expect(result).toEqual(groups);
    });
});

describe('ExamValidationModal - isAllLabsSelected', () => {
    it('returns false when no labs selected', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: [] }];
        expect(isAllLabsSelected(groups, 'g1')).toBe(false);
    });

    it('returns false when only some labs selected', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: ['Laboratorios: Hematología Completa + VS'] }];
        expect(isAllLabsSelected(groups, 'g1')).toBe(false);
    });

    it('returns true when all labs selected via selectAllLabsInProtocol', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: [] }];
        const after = selectAllLabsInProtocol(groups, 'g1');
        expect(isAllLabsSelected(after, 'g1')).toBe(true);
    });

    it('returns false again after deselectAllLabsInProtocol', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: [] }];
        const selected = selectAllLabsInProtocol(groups, 'g1');
        const deselected = deselectAllLabsInProtocol(selected, 'g1');
        expect(isAllLabsSelected(deselected, 'g1')).toBe(false);
    });

    it('uses parkinson protocol correctly', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Parkinson', exams: [] }];
        const result = selectAllLabsInProtocol(groups, 'g1');
        expect(isAllLabsSelected(result, 'g1')).toBe(true);
    });

    it('returns false for non-existent group', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: [] }];
        expect(isAllLabsSelected(groups, 'g99')).toBe(false);
    });

    it('preserves non-lab exams without affecting all-selected state', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: ['EEG'] }];
        const after = selectAllLabsInProtocol(groups, 'g1');
        expect(isAllLabsSelected(after, 'g1')).toBe(true);
        expect(after[0].exams).toContain('EEG');
    });
});

describe('ExamValidationModal - toggle behavior (select ↔ deselect)', () => {
    it('first click selects all, second click deselects all', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: [] }];
        const first = selectAllLabsInProtocol(groups, 'g1');
        expect(isAllLabsSelected(first, 'g1')).toBe(true);
        const second = deselectAllLabsInProtocol(first, 'g1');
        expect(isAllLabsSelected(second, 'g1')).toBe(false);
        const allLabs = second[0].exams.filter(e => e.startsWith('Laboratorios:'));
        expect(allLabs.length).toBe(0);
    });

    it('toggle preserves non-lab exams across cycles', () => {
        const groups: ReferralGroup[] = [{ id: 'g1', pathology: 'Epilepsia', exams: ['EEG', 'Resonancia'] }];
        const selected = selectAllLabsInProtocol(groups, 'g1');
        const deselected = deselectAllLabsInProtocol(selected, 'g1');
        expect(deselected[0].exams).toEqual(['EEG', 'Resonancia']);
    });
});

describe('ExamValidationModal - updateResonanceOrder', () => {
    it('updates field at index', () => {
        const orders: ResonanceOrder[] = [{ examName: 'RM', probableDiagnosis: '' }];
        const result = updateResonanceOrder(orders, 0, 'probableDiagnosis', 'Epilepsia');
        expect(result[0].probableDiagnosis).toBe('Epilepsia');
    });

    it('does not mutate original', () => {
        const orders: ResonanceOrder[] = [{ examName: 'RM', probableDiagnosis: '' }];
        updateResonanceOrder(orders, 0, 'probableDiagnosis', 'X');
        expect(orders[0].probableDiagnosis).toBe('');
    });
});

describe('ExamValidationModal - updateEegOrder', () => {
    it('updates string field', () => {
        const orders: EegOrder[] = [{ examName: 'EEG', probableDiagnosis: '', duration: '1 hora' }];
        const result = updateEegOrder(orders, 0, 'probableDiagnosis', 'Epilepsia');
        expect(result[0].probableDiagnosis).toBe('Epilepsia');
    });

    it('updates boolean field', () => {
        const orders: EegOrder[] = [{ examName: 'EEG', probableDiagnosis: 'X', duration: '1 hora', cctcg: false }];
        const result = updateEegOrder(orders, 0, 'cctcg', true);
        expect(result[0].cctcg).toBe(true);
    });
});

describe('ExamValidationModal - addResonanceOrder', () => {
    it('adds a new empty order to empty list', () => {
        const result = addResonanceOrder([]);
        expect(result.length).toBe(1);
        expect(result[0].probableDiagnosis).toBe('');
        expect(result[0].attentionNotes).toBe('');
        expect(result[0].sendResultsTo).toBe('Oficinas Zona 10');
    });

    it('uses default exam name from first order when adding', () => {
        const orders: ResonanceOrder[] = [
            { examName: 'RM Cerebral', probableDiagnosis: 'Epilepsia', attentionNotes: '', sendResultsTo: 'Oficinas Zona 10' }
        ];
        const result = addResonanceOrder(orders);
        expect(result[1].examName).toBe('RM Cerebral');
        expect(result[1].probableDiagnosis).toBe('');
    });

    it('uses generic name when no existing orders', () => {
        const result = addResonanceOrder([]);
        expect(result[0].examName).toBe('Resonancia Magnética');
    });

    it('preserves all existing orders', () => {
        const orders: ResonanceOrder[] = [
            { examName: 'RM1', probableDiagnosis: 'A', attentionNotes: '', sendResultsTo: 'Oficinas Zona 10' },
            { examName: 'RM2', probableDiagnosis: 'B', attentionNotes: '', sendResultsTo: 'Oficinas Zona 10' }
        ];
        const result = addResonanceOrder(orders);
        expect(result.length).toBe(3);
        expect(result[0].probableDiagnosis).toBe('A');
        expect(result[1].probableDiagnosis).toBe('B');
    });
});

describe('ExamValidationModal - removeResonanceOrder', () => {
    it('removes order at index', () => {
        const orders: ResonanceOrder[] = [
            { examName: 'A', probableDiagnosis: 'a', attentionNotes: '', sendResultsTo: 'Oficinas Zona 10' },
            { examName: 'B', probableDiagnosis: 'b', attentionNotes: '', sendResultsTo: 'Oficinas Zona 10' },
            { examName: 'C', probableDiagnosis: 'c', attentionNotes: '', sendResultsTo: 'Oficinas Zona 10' }
        ];
        const result = removeResonanceOrder(orders, 1);
        expect(result.length).toBe(2);
        expect(result[0].examName).toBe('A');
        expect(result[1].examName).toBe('C');
    });

    it('is no-op for out-of-bounds index', () => {
        const orders: ResonanceOrder[] = [
            { examName: 'A', probableDiagnosis: 'a', attentionNotes: '', sendResultsTo: 'Oficinas Zona 10' }
        ];
        const result = removeResonanceOrder(orders, 5);
        expect(result.length).toBe(1);
    });

    it('handles removing the last order', () => {
        const orders: ResonanceOrder[] = [
            { examName: 'A', probableDiagnosis: 'a', attentionNotes: '', sendResultsTo: 'Oficinas Zona 10' }
        ];
        const result = removeResonanceOrder(orders, 0);
        expect(result).toEqual([]);
    });
});

describe('ExamValidationModal - addEegOrder', () => {
    it('adds a new empty order to empty list', () => {
        const result = addEegOrder([]);
        expect(result.length).toBe(1);
        expect(result[0].probableDiagnosis).toBe('');
        expect(result[0].duration).toBe('1 hora');
        expect(result[0].cctcg).toBe(false);
        expect(result[0].crisisEstaticas).toBe(false);
    });

    it('uses default exam name from first order when adding', () => {
        const orders: EegOrder[] = [
            { examName: 'Video-EEG', probableDiagnosis: 'Epilepsia', duration: '3 horas' }
        ];
        const result = addEegOrder(orders);
        expect(result[1].examName).toBe('Video-EEG');
        expect(result[1].probableDiagnosis).toBe('');
        expect(result[1].duration).toBe('1 hora');
    });

    it('initializes all boolean fields to false', () => {
        const result = addEegOrder([]);
        expect(result[0].cctcg).toBe(false);
        expect(result[0].cpc).toBe(false);
        expect(result[0].cpcSecGeneralizadas).toBe(false);
        expect(result[0].ausencias).toBe(false);
        expect(result[0].crisisMioclonicas).toBe(false);
        expect(result[0].crisisEstaticas).toBe(false);
        expect(result[0].spikeDetection64).toBe(false);
        expect(result[0].spikeDetection128).toBe(false);
        expect(result[0].p300).toBe(false);
    });

    it('initializes sleep deprivation to "No"', () => {
        const result = addEegOrder([]);
        expect(result[0].videoMonitoringSleepDeprivation).toBe('No');
        expect(result[0].ictalSleepDeprivation).toBe('No');
    });
});

describe('ExamValidationModal - removeEegOrder', () => {
    it('removes order at index', () => {
        const orders: EegOrder[] = [
            { examName: 'A', probableDiagnosis: 'a', duration: '1 hora' },
            { examName: 'B', probableDiagnosis: 'b', duration: '1 hora' }
        ];
        const result = removeEegOrder(orders, 0);
        expect(result.length).toBe(1);
        expect(result[0].examName).toBe('B');
    });

    it('handles removing the last order', () => {
        const orders: EegOrder[] = [
            { examName: 'A', probableDiagnosis: 'a', duration: '1 hora' }
        ];
        const result = removeEegOrder(orders, 0);
        expect(result).toEqual([]);
    });
});

describe('ExamValidationModal - multiple orders workflow (resonance)', () => {
    it('can add then remove orders', () => {
        let orders: ResonanceOrder[] = [];
        orders = addResonanceOrder(orders);
        orders = addResonanceOrder(orders);
        orders = addResonanceOrder(orders);
        expect(orders.length).toBe(3);

        orders = removeResonanceOrder(orders, 1);
        expect(orders.length).toBe(2);
    });

    it('supports multiple orders with different data', () => {
        let orders: ResonanceOrder[] = [];
        orders = addResonanceOrder(orders);
        orders = updateResonanceOrder(orders, 0, 'probableDiagnosis', 'Epilepsia');
        orders = updateResonanceOrder(orders, 0, 'attentionNotes', 'Lesiones temporales');

        orders = addResonanceOrder(orders);
        orders = updateResonanceOrder(orders, 1, 'probableDiagnosis', 'Migraña');

        expect(orders[0].probableDiagnosis).toBe('Epilepsia');
        expect(orders[1].probableDiagnosis).toBe('Migraña');
        expect(orders[0].attentionNotes).toBe('Lesiones temporales');
    });
});

describe('ExamValidationModal - multiple orders workflow (eeg)', () => {
    it('can add then remove orders', () => {
        let orders: EegOrder[] = [];
        orders = addEegOrder(orders);
        orders = addEegOrder(orders);
        expect(orders.length).toBe(2);

        orders = removeEegOrder(orders, 0);
        expect(orders.length).toBe(1);
    });

    it('supports multiple orders with different data', () => {
        let orders: EegOrder[] = [];
        orders = addEegOrder(orders);
        orders = updateEegOrder(orders, 0, 'probableDiagnosis', 'Epilepsia');
        orders = updateEegOrder(orders, 0, 'duration', '3 horas');
        orders = updateEegOrder(orders, 0, 'cctcg', true);

        orders = addEegOrder(orders);
        orders = updateEegOrder(orders, 1, 'probableDiagnosis', 'Crisis');

        expect(orders[0].probableDiagnosis).toBe('Epilepsia');
        expect(orders[0].duration).toBe('3 horas');
        expect(orders[0].cctcg).toBe(true);
        expect(orders[1].probableDiagnosis).toBe('Crisis');
        expect(orders[1].cctcg).toBe(false);
    });
});
