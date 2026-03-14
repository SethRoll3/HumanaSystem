import React, { useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { X, Loader2, FileText, Stethoscope, History } from 'lucide-react';
import { toast } from 'sonner';
import { Appointment, Consultation, Patient, UserProfile } from '../../types';
import { SpecialtyFormContainer } from '../Wizard/SpecialtyForms/SpecialtyFormContainer';
import { specialtyFormsService } from '../../services/specialtyFormsService';
import { appointmentService } from '../../services/appointmentService';
import { patientService } from '../../services/patientService';
import { logAuditAction } from '../../services/auditService';

interface ResidentClinicalFormValues {
  specialtyFormId?: string;
  specialtyFormName?: string;
  specialtyData?: Record<string, any>;
}

interface ResidentClinicalFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: Appointment;
  patient: Patient;
  currentUser: UserProfile;
  onSaveComplete?: (updates: Partial<Appointment>) => void;
}

export const ResidentClinicalFormModal: React.FC<ResidentClinicalFormModalProps> = ({
  isOpen,
  onClose,
  appointment,
  patient,
  currentUser,
  onSaveComplete
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [existingFichas, setExistingFichas] = useState<Consultation[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [availableForms, setAvailableForms] = useState<{ id: string; name: string }[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [selectedExistingId, setSelectedExistingId] = useState<string | null>(null);
  const [forcedFormId, setForcedFormId] = useState<string | undefined>(undefined);
  const [forceSelectToken, setForceSelectToken] = useState(0);

  const getAppointmentDefaults = (): ResidentClinicalFormValues => ({
    specialtyFormId: appointment.residentSpecialtyFormId || undefined,
    specialtyFormName: appointment.residentSpecialtyFormName || undefined,
    specialtyData: appointment.residentSpecialtyData || {}
  });

  const methods = useForm<ResidentClinicalFormValues>({
    defaultValues: getAppointmentDefaults()
  });

  useEffect(() => {
    methods.reset(getAppointmentDefaults());
    setForcedFormId(appointment.residentSpecialtyFormId || undefined);
    setSelectedExistingId(null);
    setForceSelectToken(prev => prev + 1);
  }, [appointment, methods]);

  useEffect(() => {
    const loadExistingFichas = async () => {
      if (!isOpen || !patient?.id) return;
      setLoadingExisting(true);
      setLoadingForms(true);
      try {
        const [history, forms] = await Promise.all([
          patientService.getHistory(patient.id),
          specialtyFormsService.getAll()
        ]);
        setExistingFichas(history);
        setAvailableForms(forms.map(form => ({ id: form.id, name: form.name })));
      } catch (error) {
        console.error('Error cargando fichas previas', error);
      } finally {
        setLoadingExisting(false);
        setLoadingForms(false);
      }
    };
    loadExistingFichas();
  }, [isOpen, patient?.id]);

  if (!isOpen) return null;

  const selectedFormId = methods.watch('specialtyFormId') as string | undefined;
  const existingByFormId = existingFichas.reduce<Record<string, Consultation[]>>((acc, ficha) => {
    const formId = (ficha as any).specialtyFormId as string | undefined;
    if (!formId) return acc;
    if (!acc[formId]) acc[formId] = [];
    acc[formId].push(ficha);
    return acc;
  }, {});
  const hasExistingForSelected = !!(selectedFormId && existingByFormId[selectedFormId]?.length);
  const formsWithoutFicha = availableForms.filter(form => !existingByFormId[form.id] || existingByFormId[form.id].length === 0);
  const allFormsHaveFicha = availableForms.length > 0 && formsWithoutFicha.length === 0;
  const appointmentHasData =
    appointment.residentClinicalCompleted === true ||
    (appointment.residentSpecialtyData && Object.keys(appointment.residentSpecialtyData).length > 0);

  const handleSave = async () => {
    if (!appointment.id) {
      toast.error('No se pudo identificar la cita.');
      return;
    }

    setIsSaving(true);
    try {
      const raw = methods.getValues();
      const specialtyFormId = raw.specialtyFormId;
      const rawSpecialtyData = (raw.specialtyData || {}) as Record<string, any>;

      let filteredSpecialtyData: Record<string, any> = rawSpecialtyData;
      let specialtyFormName: string | undefined = raw.specialtyFormName;

      if (specialtyFormId) {
        try {
          const forms = await specialtyFormsService.getAll();
          const activeForm = forms.find(f => f.id === specialtyFormId);
          if (activeForm) {
            const allowedIds = activeForm.sections.flatMap(section =>
              section.fields.map(field => field.id)
            );
            const next: Record<string, any> = {};
            for (const id of allowedIds) {
              next[id] = rawSpecialtyData[id] ?? null;
            }
            filteredSpecialtyData = next;
            specialtyFormName = activeForm.name;
          }
        } catch (err) {
          console.error('Error cargando fichas para filtrar specialtyData', err);
        }
      }

      if (!appointmentHasData && hasExistingForSelected && !selectedExistingId) {
        toast.error('Ya existe una ficha para esta especialidad. Seleccione la existente.');
        setIsSaving(false);
        return;
      }

      const updates: Partial<Appointment> = {
        residentClinicalCompleted: true,
        residentSpecialtyFormId: specialtyFormId || null,
        residentSpecialtyFormName: specialtyFormName || null,
        residentSpecialtyData: filteredSpecialtyData || {}
      };

      if (appointment.consultationType === 'Nueva' && appointment.status === 'paid_checked_in') {
        updates.status = 'resident_intake';
      }

      await appointmentService.updateAppointment(appointment.id, updates, {
        editorId: currentUser.uid,
        editorName: currentUser.name
      });

      const userEmail = currentUser.email || 'system@humana.com';
      const action = appointment.residentClinicalCompleted ? 'EDITAR_FICHA_RESIDENTE' : 'CREAR_FICHA_RESIDENTE';
      const detail = `Paciente ${patient.fullName} (${patient.id}) | Ficha ${specialtyFormName || 'N/A'} (${specialtyFormId || 'N/A'}) | Cita ${appointment.id}`;
      await logAuditAction(userEmail, action, detail);

      onSaveComplete?.(updates);
      toast.success('Ficha clínica guardada');
      onClose();
    } catch (error) {
      console.error('Error al guardar ficha clínica', error);
      toast.error('No se pudo guardar la ficha clínica.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectExistingFicha = (ficha: Consultation) => {
    const formId = (ficha as any).specialtyFormId as string | undefined;
    const formName = (ficha as any).specialtyFormName as string | undefined;
    const data = (ficha as any).specialtyData as Record<string, any> | undefined;

    methods.reset({
      specialtyFormId: formId || undefined,
      specialtyFormName: formName || undefined,
      specialtyData: data || {}
    });
    setForcedFormId(formId || undefined);
    setSelectedExistingId(ficha.id || null);
    setForceSelectToken(prev => prev + 1);
  };

  const handleSelectEmptyForm = (formId: string) => {
    const formName = availableForms.find(form => form.id === formId)?.name;
    methods.reset({
      specialtyFormId: formId,
      specialtyFormName: formName || undefined,
      specialtyData: {}
    });
    setForcedFormId(formId);
    setSelectedExistingId(null);
    setForceSelectToken(prev => prev + 1);
  };

  const handleResetToAppointment = () => {
    if (!appointmentHasData && hasExistingForSelected) {
      const list = selectedFormId ? existingByFormId[selectedFormId] : undefined;
      if (list && list.length > 0) {
        const latest = [...list].sort((a, b) => b.date - a.date)[0];
        handleSelectExistingFicha(latest);
      }
      return;
    }
    methods.reset(getAppointmentDefaults());
    setForcedFormId(appointment.residentSpecialtyFormId || undefined);
    setSelectedExistingId(null);
    setForceSelectToken(prev => prev + 1);
  };

  const formatDateTimeGT = (ts: number) => {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleString('es-GT', {
      timeZone: 'America/Guatemala',
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };

  useEffect(() => {
    if (!selectedFormId) return;
    if (!hasExistingForSelected || appointmentHasData) return;
    const list = existingByFormId[selectedFormId] || [];
    if (list.length === 0) return;
    const latest = [...list].sort((a, b) => b.date - a.date)[0];
    if (latest?.id && latest.id === selectedExistingId) return;
    handleSelectExistingFicha(latest);
  }, [selectedFormId, hasExistingForSelected, existingByFormId, appointmentHasData, selectedExistingId]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-brand-900 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-brand-800 text-white w-10 h-10 rounded-xl flex items-center justify-center">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-200" />
                Ficha clínica del residente
              </h2>
              <p className="text-sm text-brand-100">
                Paciente: {patient.fullName} ({patient.billingCode})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/60 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-brand-600" />
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">Fichas clínicas existentes</h3>
              </div>
              <button
                type="button"
                onClick={handleResetToAppointment}
                disabled={!appointmentHasData && hasExistingForSelected}
                className="text-[11px] font-bold text-brand-600 hover:text-brand-700"
              >
                Volver a ficha actual
              </button>
            </div>

            {(loadingExisting || loadingForms) ? (
              <div className="text-xs text-slate-400">Cargando fichas...</div>
            ) : existingFichas.length === 0 ? (
              <div className="text-xs text-slate-400">No hay fichas clínicas previas.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {existingFichas.map(ficha => {
                  const isActive = ficha.id && ficha.id === selectedExistingId;
                  const formName = (ficha as any).specialtyFormName as string | undefined;
                  return (
                    <button
                      key={ficha.id || `${ficha.patientId}-${ficha.date}`}
                      type="button"
                      onClick={() => handleSelectExistingFicha(ficha)}
                      className={`flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition ${
                        isActive
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-slate-200 bg-white hover:border-brand-200'
                      }`}
                    >
                      <div>
                        <p className="text-xs font-bold text-slate-700">{formatDateTimeGT(ficha.date)}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide">{formName || 'Ficha clínica'}</p>
                        <p className="text-[10px] text-slate-400">Dr. {ficha.doctorName || 'N/A'}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${isActive ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {isActive ? 'Seleccionada' : 'Usar'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {!loadingForms && formsWithoutFicha.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Fichas sin registro</p>
                <div className="flex flex-wrap gap-2">
                  {formsWithoutFicha.map(form => (
                    <button
                      key={form.id}
                      type="button"
                      onClick={() => handleSelectEmptyForm(form.id)}
                      className="px-2.5 py-1 text-[10px] font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:border-emerald-300 hover:bg-emerald-100 transition"
                    >
                      {form.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!loadingForms && allFormsHaveFicha && (
              <div className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
                Todas las fichas ya tienen registro para este paciente.
              </div>
            )}
          </div>

          <FormProvider {...methods}>
            <SpecialtyFormContainer
              doctorSpecialties={currentUser.specialties || (currentUser.specialty ? [currentUser.specialty] : [])}
              forcedFormId={forcedFormId}
              forceSelectToken={forceSelectToken}
              onFormChange={(formId) => {
                if (selectedExistingId) {
                  const existing = existingFichas.find(ficha => ficha.id === selectedExistingId);
                  const existingFormId = (existing as any)?.specialtyFormId as string | undefined;
                  if (existingFormId !== formId) {
                    setSelectedExistingId(null);
                  }
                }
                setForcedFormId(undefined);
              }}
              disableSwitch={false}
            />
          </FormProvider>
        </div>

        <div className="border-t bg-white px-6 py-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 rounded-xl bg-brand-600 text-white font-bold hover:bg-brand-700 transition flex items-center gap-2 disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Guardar ficha
          </button>
        </div>
      </div>
    </div>
  );
};
