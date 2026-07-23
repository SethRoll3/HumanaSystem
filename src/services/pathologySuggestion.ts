import { Pathology } from '../types';
import { categorizeDiagnosis } from '../utils/diagnosisCategorization';

const normalizeText = (text: string): string =>
    text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const stripPunctuation = (text: string): string =>
    text.replace(/[.,;:()\[\]/\\\-_"'`!?¿¡]/g, ' ').replace(/\s+/g, ' ').trim();

const tokenize = (text: string): string[] => {
    const norm = normalizeText(stripPunctuation(text));
    if (!norm) return [];
    const stopWords = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'o', 'u', 'en', 'con', 'sin', 'por', 'para', 'a', 'un', 'una', 'tipo', 'masivo', 'masiva', 'aguda', 'agudo', 'cronica', 'cronico']);
    return norm.split(' ').filter(w => w.length >= 3 && !stopWords.has(w));
};

const jaccardSimilarity = (a: string[], b: string[]): number => {
    if (a.length === 0 && b.length === 0) return 1;
    if (a.length === 0 || b.length === 0) return 0;
    const setA = new Set(a);
    const setB = new Set(b);
    let intersection = 0;
    setA.forEach(x => { if (setB.has(x)) intersection++; });
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
};

const levenshtein = (a: string, b: string): number => {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
};

const wordSimilarity = (a: string, b: string): number => {
    if (a === b) return 1;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 0;
    const distance = levenshtein(a, b);
    return 1 - distance / maxLen;
};

const computeBestWordMatch = (diagnosisTokens: string[], pathologyTokens: string[]): number => {
    if (diagnosisTokens.length === 0 || pathologyTokens.length === 0) return 0;
    let total = 0;
    let matched = 0;
    diagnosisTokens.forEach(dt => {
        total++;
        let best = 0;
        pathologyTokens.forEach(pt => {
            const sim = wordSimilarity(dt, pt);
            if (sim > best) best = sim;
        });
        if (best >= 0.75) matched += best;
    });
    return total === 0 ? 0 : matched / total;
};

const extractKeywordsFromCategory = (category: string): string[] => {
    const parts = category.split(/[\/(),\-]/);
    const stopWords = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'o', 'u', 'en', 'con', 'sin', 'por', 'para', 'a', 'un', 'una', 'tipo', 'y/o']);
    return parts
        .map(p => normalizeText(p.trim()))
        .filter(p => p.length >= 3 && !stopWords.has(p));
};

const matchByCategory = (pathology: Pathology, category: string): boolean => {
    const keywords = extractKeywordsFromCategory(category);
    if (keywords.length === 0) return false;
    const pathologyNorm = normalizeText(pathology.name);
    return keywords.some(kw => pathologyNorm.includes(kw));
};

const matchByCategoryFuzzy = (pathology: Pathology, category: string): number => {
    const keywords = extractKeywordsFromCategory(category);
    if (keywords.length === 0) return 0;
    const pathologyNorm = normalizeText(pathology.name);
    const pathologyTokens = tokenize(pathology.name);
    let best = 0;
    keywords.forEach(kw => {
        if (pathologyNorm.includes(kw)) {
            best = Math.max(best, 0.9);
            return;
        }
        const kwTokens = tokenize(kw);
        kwTokens.forEach(kt => {
            pathologyTokens.forEach(pt => {
                const sim = wordSimilarity(kt, pt);
                if (sim > best) best = sim;
            });
        });
    });
    return best;
};

interface ScoreResult { pathology: Pathology; score: number }

const scoreDirectMatch = (diagnosis: string, pathology: Pathology): number => {
    const diagnosisNorm = normalizeText(stripPunctuation(diagnosis));
    const diagnosisTokens = tokenize(diagnosis);
    const pathologyNameNorm = normalizeText(stripPunctuation(pathology.name));
    const pathologyTokens = tokenize(pathology.name);

    if (pathologyNameNorm && diagnosisNorm.includes(pathologyNameNorm)) {
        return 1.0;
    }

    const wordMatch = computeBestWordMatch(diagnosisTokens, pathologyTokens);
    if (wordMatch >= 0.8) {
        return 0.85 + (wordMatch - 0.8) * 0.5;
    }

    const jaccard = jaccardSimilarity(diagnosisTokens, pathologyTokens);
    if (jaccard >= 0.5) {
        return 0.6 + jaccard * 0.2;
    }

    let bestFuzzy = 0;
    for (const dt of diagnosisTokens) {
        for (const pt of pathologyTokens) {
            const sim = wordSimilarity(dt, pt);
            if (sim > bestFuzzy) bestFuzzy = sim;
        }
    }
    if (bestFuzzy >= 0.85) {
        return 0.55 + (bestFuzzy - 0.85) * 1.0;
    }
    return 0;
};

export const suggestPathology = async (diagnosis: string | undefined, pathologies: Pathology[]): Promise<Pathology | null> => {
    if (!diagnosis || !diagnosis.trim()) return null;
    if (!pathologies || pathologies.length === 0) return null;

    const diagnosisNorm = normalizeText(stripPunctuation(diagnosis));
    if (!diagnosisNorm) return null;

    const candidates: ScoreResult[] = [];

    for (const pathology of pathologies) {
        const directScore = scoreDirectMatch(diagnosis, pathology);
        if (directScore >= 0.6) {
            candidates.push({ pathology, score: directScore });
        }
    }

    if (candidates.length === 0) {
        try {
            const categorized = await categorizeDiagnosis(diagnosis, pathologies);
            if (categorized.kind === 'predefined' && categorized.category !== 'Otro') {
                for (const pathology of pathologies) {
                    if (matchByCategory(pathology, categorized.category)) {
                        candidates.push({ pathology, score: 0.75 });
                    } else {
                        const fuzzyScore = matchByCategoryFuzzy(pathology, categorized.category);
                        if (fuzzyScore >= 0.8) {
                            candidates.push({ pathology, score: 0.65 + (fuzzyScore - 0.8) * 0.5 });
                        }
                    }
                }
            } else if (categorized.kind === 'otro' && categorized.subtype) {
                const subtypeNorm = normalizeText(categorized.subtype);
                for (const pathology of pathologies) {
                    const pathologyNorm = normalizeText(pathology.name);
                    if (pathologyNorm.includes(subtypeNorm) || subtypeNorm.includes(pathologyNorm)) {
                        candidates.push({ pathology, score: 0.7 });
                    }
                }
            }
        } catch {
            // ignore — categorizeDiagnosis may fail in test env without Firebase
        }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.pathology.name.length - a.pathology.name.length;
    });
    return candidates[0].pathology;
};
