import { describe, it, expect } from 'vitest';
import { suggestPathology } from '../services/pathologySuggestion';
import { Pathology } from '../types';

const pat = (name: string, exams: string[] = []): Pathology => ({ name, exams });

describe('suggestPathology - empty/invalid inputs', () => {
    it('returns null when diagnosis is undefined', async () => {
        expect(await suggestPathology(undefined, [pat('Epilepsia')])).toBeNull();
    });

    it('returns null when diagnosis is empty string', async () => {
        expect(await suggestPathology('', [pat('Epilepsia')])).toBeNull();
    });

    it('returns null when diagnosis is whitespace', async () => {
        expect(await suggestPathology('   \n  ', [pat('Epilepsia')])).toBeNull();
    });

    it('returns null when pathologies array is empty', async () => {
        expect(await suggestPathology('epilepsia', [])).toBeNull();
    });

    it('returns null when pathologies is undefined', async () => {
        expect(await suggestPathology('epilepsia', undefined as any)).toBeNull();
    });
});

describe('suggestPathology - exact and partial matches', () => {
    it('finds exact match: "epilepsia" → "Epilepsia"', async () => {
        const result = await suggestPathology('epilepsia', [pat('Epilepsia'), pat('Parkinson')]);
        expect(result?.name).toBe('Epilepsia');
    });

    it('finds partial match: "epilepsia refractaria" → "Epilepsia"', async () => {
        const result = await suggestPathology('epilepsia refractaria del lobulo temporal', [
            pat('Epilepsia'),
            pat('Parkinson')
        ]);
        expect(result?.name).toBe('Epilepsia');
    });

    it('matches case-insensitively', async () => {
        const result = await suggestPathology('EPILEPSIA', [pat('Epilepsia')]);
        expect(result?.name).toBe('Epilepsia');
    });

    it('matches accent-insensitively', async () => {
        const result = await suggestPathology('Migrana cronica', [pat('Migraña')]);
        expect(result?.name).toBe('Migraña');
    });

    it('handles punctuation in diagnosis', async () => {
        const result = await suggestPathology('Epilepsia, ¿refractaria?', [pat('Epilepsia')]);
        expect(result?.name).toBe('Epilepsia');
    });
});

describe('suggestPathology - fuzzy matches', () => {
    it('matches with small typo: "diabetis" → "Diabetes Mellitus"', async () => {
        const result = await suggestPathology('diabetis mellitus tipo 2', [
            pat('Diabetes Mellitus Tipo 2'),
            pat('Hipertensión Arterial')
        ]);
        expect(result?.name).toBe('Diabetes Mellitus Tipo 2');
    });

    it('matches word with one character difference: "parkinsoniano" → "Parkinson"', async () => {
        const result = await suggestPathology('sindrome parkinsoniano', [
            pat('Parkinson'),
            pat('Epilepsia')
        ]);
        expect(result?.name).toBe('Parkinson');
    });

    it('handles abbreviations: "HTA" → no match (abbreviations not supported)', async () => {
        const result = await suggestPathology('hta controlada', [pat('Hipertensión Arterial')]);
        expect(result).toBeNull();
    });
});

describe('suggestPathology - no match scenarios', () => {
    it('returns null when no pathology matches', async () => {
        const result = await suggestPathology('xyz abc def', [
            pat('Epilepsia'),
            pat('Parkinson')
        ]);
        expect(result).toBeNull();
    });

    it('returns null when only stop words match', async () => {
        const result = await suggestPathology('de la con y el', [pat('Diabetes Mellitus')]);
        expect(result).toBeNull();
    });

    it('returns null when diagnosis is too short (1-2 chars)', async () => {
        const result = await suggestPathology('ab', [pat('Anemia Ferropénica')]);
        expect(result).toBeNull();
    });
});

describe('suggestPathology - ranking', () => {
    it('returns best match when multiple candidates exist', async () => {
        const result = await suggestPathology('epilepsia del lobulo temporal', [
            pat('Epilepsia del Lóbulo Temporal'),
            pat('Epilepsia'),
            pat('Parkinson')
        ]);
        expect(result?.name).toBe('Epilepsia del Lóbulo Temporal');
    });

    it('prefers exact contains-match over word-match', async () => {
        const result = await suggestPathology('diabetes mellitus tipo 2', [
            pat('Diabetes Mellitus'),
            pat('Diabetes Mellitus Tipo 2')
        ]);
        expect(result?.name).toBe('Diabetes Mellitus Tipo 2');
    });
});

describe('suggestPathology - real-world pathologies', () => {
    const seedPathologies: Pathology[] = [
        pat('Epilepsia', ['EEG', 'Resonancia']),
        pat('Parkinson', ['TSH', 'T4']),
        pat('Migraña', ['Resonancia']),
        pat('Esclerosis Múltiple', ['Resonancia', 'Laboratorios']),
        pat('ACV', ['Tomografía', 'Resonancia']),
        pat('Demencia', ['Mini Mental', 'Resonancia'])
    ];

    it('finds Epilepsia for "crisis convulsivas"', async () => {
        const result = await suggestPathology('crisis convulsivas tónico-clónicas', seedPathologies);
        expect(result?.name).toBe('Epilepsia');
    });

    it('finds Parkinson for "temblor en reposo"', async () => {
        const result = await suggestPathology('temblor en reposo y bradicinesia', seedPathologies);
        expect(result?.name).toBe('Parkinson');
    });

    it('finds Migraña for "cefalea"', async () => {
        const result = await suggestPathology('cefalea hemicraneal recurrente', seedPathologies);
        expect(result?.name).toBe('Migraña');
    });

    it('finds ACV for "evento cerebrovascular"', async () => {
        const result = await suggestPathology('evento cerebrovascular isquémico', seedPathologies);
        expect(result?.name).toBe('ACV');
    });

    it('returns null for unrelated diagnosis', async () => {
        const result = await suggestPathology('fractura de femur', seedPathologies);
        expect(result).toBeNull();
    });
});
