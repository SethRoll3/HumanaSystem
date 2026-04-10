const fs = require('fs');
const p = 'c:/Users/Boteo/Documents/HumanaSystem/HumanaSystem/src/components/Wizard/StepExams.tsx';
let txt = fs.readFileSync(p, 'utf8');

txt = txt.replace(/className=\{`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 bg-white \$\{\n[\s\S]*?\}`\}/g, (m) => {
  if (m.includes('indigo-200')) return 'className="w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 bg-white border-indigo-200 focus:ring-indigo-200 focus:border-indigo-500"';
  if (m.includes('emerald-200')) return 'className="w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 bg-white border-emerald-200 focus:ring-emerald-200 focus:border-emerald-500"';
  return m;
});

txt = txt.replace(/className=\{`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 \$\{\n[\s\S]*?\}`\}/g, (m) => {
  if (m.includes('indigo-200')) return 'className="w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 border-indigo-200 focus:ring-indigo-200 focus:border-indigo-500"';
  if (m.includes('emerald-200')) return 'className="w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 border-emerald-200 focus:ring-emerald-200 focus:border-emerald-500"';
  return m;
});

fs.writeFileSync(p, txt);
console.log('done replacing');
