import * as React from 'react';
import { useMemo, useState } from 'react';
import { User, Hash, Phone, Mail, Briefcase, Calendar, MapPin, Globe, Building2, Home, Stethoscope, ClipboardList, FileText, Users, ShieldCheck } from 'lucide-react';
import { Patient, UserProfile } from '../../types.ts';
import { Cuaderno } from './Cuaderno';
import { PatientEditModal } from './PatientEditModal';

interface PatientDetailViewProps {
  patient: Patient;
  currentUser: UserProfile;
  onBack: () => void;
  onPatientUpdated: (updated: Patient) => void;
}

type InfoItem = {
  label: string;
  value: string;
  icon: React.ElementType;
  tone?: string;
};

const formatValue = (value: any) => {
  if (value === undefined || value === null) return 'Sin dato';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : 'Sin dato';
  }
  return String(value);
};

const formatDateValue = (value: any) => {
  if (!value) return 'Sin dato';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value).toLocaleString('es-GT', { timeZone: 'America/Guatemala' });
  if (value?.toDate) return value.toDate().toLocaleString('es-GT', { timeZone: 'America/Guatemala' });
  return 'Sin dato';
};

const getGenderLabel = (gender?: Patient['gender']) => {
  if (!gender) return 'Sin dato';
  if (gender === 'M' || gender === 'masculino') return 'Masculino';
  if (gender === 'F' || gender === 'femenino') return 'Femenino';
  return String(gender);
};

const buildAddress = (patient: Patient) => {
  const address = patient.address;
  if (!address) return 'Sin dato';
  const parts = [
    address.country,
    address.department,
    address.municipality,
    address.zone ? `Zona ${address.zone}` : undefined
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Sin dato';
};

const toneStyles: Record<string, { bg: string; text: string }> = {
  brand: { bg: 'bg-brand-100', text: 'text-brand-700' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-700' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  sky: { bg: 'bg-sky-100', text: 'text-sky-700' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-700' },
  violet: { bg: 'bg-violet-100', text: 'text-violet-700' },
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-700' },
  cyan: { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700' }
};

const InfoCard = ({ item }: { item: InfoItem }) => {
  const Icon = item.icon;
  const tone = toneStyles[item.tone || 'slate'] || toneStyles.slate;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tone.bg} ${tone.text}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{item.label}</p>
        <p className="text-sm font-semibold text-slate-800 break-words">{item.value}</p>
      </div>
    </div>
  );
};

export const PatientDetailView: React.FC<PatientDetailViewProps> = ({
  patient,
  currentUser,
  onBack,
  onPatientUpdated
}) => {
  const [showEditModal, setShowEditModal] = useState(false);

  const addressValue = useMemo(() => buildAddress(patient), [patient]);
  const detailItems = useMemo<InfoItem[]>(() => [
    { label: 'Nombre completo', value: formatValue(patient.fullName), icon: User, tone: 'brand' },
    { label: 'DPI', value: formatValue(patient.dpi), icon: Hash, tone: 'slate' },
    { label: 'Código facturación', value: formatValue(patient.billingCode), icon: Hash, tone: 'slate' },
    { label: 'Teléfono', value: formatValue(patient.phone), icon: Phone, tone: 'emerald' },
    { label: 'Email', value: formatValue(patient.email), icon: Mail, tone: 'sky' },
    { label: 'Ocupación', value: formatValue(patient.occupation), icon: Briefcase, tone: 'amber' },
    { label: 'Edad', value: formatValue(patient.age), icon: Calendar, tone: 'violet' },
    { label: 'Fecha nacimiento', value: formatValue(patient.birthDate), icon: Calendar, tone: 'indigo' },
    { label: 'Género', value: getGenderLabel(patient.gender), icon: ShieldCheck, tone: 'slate' },
    { label: 'Dirección', value: addressValue, icon: MapPin, tone: 'teal' },
    { label: 'País', value: formatValue(patient.address?.country), icon: Globe, tone: 'cyan' }
  ], [patient, addressValue]);

  const clinicalTags = [
    { label: 'Centro', value: patient.careCenter, tone: 'emerald' },
    { label: 'Tratamiento previo', value: patient.previousTreatment, tone: 'amber' },
    { label: 'Detalle IGSS', value: patient.previousTreatmentDetail, tone: 'orange' },
    { label: 'Canal de referencia', value: patient.referralChannel, tone: 'violet' },
    { label: 'Origen', value: patient.origin, tone: 'slate' },
    { label: 'Código protocolo', value: patient.protocol_code, tone: 'teal' }
  ].filter(tag => tag.value);

  const responsibleItems: InfoItem[] = [
    { label: 'Responsable', value: formatValue(patient.responsibleName), icon: Users, tone: 'slate' },
    { label: 'Teléfono responsable', value: formatValue(patient.responsiblePhone), icon: Phone, tone: 'slate' },
    { label: 'Email responsable', value: formatValue(patient.responsibleEmail), icon: Mail, tone: 'slate' }
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button type="button" onClick={onBack} className="text-xs font-bold text-slate-600 hover:text-slate-900">
            Volver a lista
          </button>
          <button type="button" onClick={() => setShowEditModal(true)} className="px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl">
            Editar paciente
          </button>
        </div>
        <div className="mt-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-3xl bg-brand-50 text-brand-700 flex items-center justify-center text-2xl font-bold overflow-hidden">
              {patient.photoUrl ? (
                <img src={patient.photoUrl} alt="Foto del paciente" className="w-full h-full object-cover" />
              ) : (
                patient.fullName?.charAt(0)
              )}
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{patient.fullName}</p>
              <p className="text-xs text-slate-500 font-mono">{patient.billingCode || '—'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {patient.careCenter && (
              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">
                {patient.careCenter}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
        <div>
          <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-slate-500" />
            Datos personales y contacto
          </p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {detailItems.map((item, idx) => (
              <InfoCard key={`${item.label}-${idx}`} item={item} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Home className="w-4 h-4 text-slate-500" />
              Dirección completa
            </div>
            <p className="text-sm text-slate-700">{addressValue}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600">
              <span className="flex items-center gap-2"><Globe className="w-3 h-3" />{formatValue(patient.address?.country)}</span>
              <span className="flex items-center gap-2"><Building2 className="w-3 h-3" />{formatValue(patient.address?.department)}</span>
              <span className="flex items-center gap-2"><MapPin className="w-3 h-3" />{formatValue(patient.address?.municipality)}</span>
              <span className="flex items-center gap-2"><MapPin className="w-3 h-3" />{formatValue(patient.address?.zone ? `Zona ${patient.address.zone}` : undefined)}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Stethoscope className="w-4 h-4 text-slate-500" />
              Datos clínicos
            </div>
            <div className="flex flex-wrap gap-2">
              {clinicalTags.length > 0 ? clinicalTags.map(tag => {
                const tagTone = toneStyles[tag.tone || 'slate'] || toneStyles.slate;
                return (
                  <span key={tag.label} className={`px-3 py-1 rounded-full text-xs font-semibold ${tagTone.bg} ${tagTone.text}`}>
                    {tag.label}: {tag.value}
                  </span>
                );
              }) : (
                <span className="text-xs text-slate-500">Sin datos clínicos registrados.</span>
              )}
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-3 text-sm text-slate-700">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Antecedentes médicos</p>
              <p className="whitespace-pre-wrap">{formatValue(patient.medical_history)}</p>
            </div>
          </div>
        </div>

        <div>
          <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            Responsable
          </p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {responsibleItems.map((item, idx) => (
              <InfoCard key={`${item.label}-${idx}`} item={item} />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <FileText className="w-4 h-4 text-slate-500" />
            Información adicional
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600">
            <span>Fecha de creación: {formatDateValue(patient.createdAt)}</span>
            <span>ID interno: {formatValue(patient.id)}</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <p className="text-sm font-bold text-slate-700 mb-4">Archivos adjuntos</p>
        {patient.historyFiles && patient.historyFiles.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {patient.historyFiles.map((file, idx) => (
              <a
                key={idx}
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700"
              >
                {file.name} {file.type ? `(${file.type})` : ''}
              </a>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No hay archivos adjuntos.</p>
        )}
      </div>

      <Cuaderno patient={patient} currentUser={currentUser} />

      <PatientEditModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        patient={patient}
        currentUser={currentUser}
        onSaved={(updated) => {
          setShowEditModal(false);
          onPatientUpdated(updated);
        }}
      />
    </div>
  );
};
