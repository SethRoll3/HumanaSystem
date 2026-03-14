import * as React from 'react';
import { useState, useEffect } from 'react';
import { SpecialtyFormDefinition, FormSection, FormField, FieldType } from '../Wizard/SpecialtyForms/types';
import { specialtyFormsService } from '../../services/specialtyFormsService';
import { Plus, Save, Trash2, Loader2, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { Specialty } from '../../types';
import { getSpecialties } from '../../services/inventoryService.ts';

type EditableForm = SpecialtyFormDefinition;

export const SpecialtyFormsAdmin: React.FC = () => {
  const [forms, setForms] = useState<EditableForm[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [optionsInputByField, setOptionsInputByField] = useState<Record<string, string>>({});

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        setLoading(true);
      } catch (e: any) {
        console.error('[SpecialtyFormsAdmin] Error inesperado antes de cargar datos', e);
      } finally {
        // nada aquí, continuamos abajo
      }

      let all: EditableForm[] = [];
      let specs: Specialty[] = [];

      try {
        console.log('[SpecialtyFormsAdmin] Cargando fichas (specialty_forms)...');
        all = await specialtyFormsService.getAll();
        console.log('[SpecialtyFormsAdmin] Fichas cargadas:', all.length, all);
      } catch (e: any) {
        console.error('[SpecialtyFormsAdmin] Error cargando SOLO fichas (specialty_forms)', e);
        toast.error('Error cargando fichas clínicas (revisar permisos de specialty_forms)');
      }

      try {
        console.log('[SpecialtyFormsAdmin] Cargando especialidades (specialties)...');
        specs = await getSpecialties();
        console.log('[SpecialtyFormsAdmin] Especialidades cargadas:', specs.length, specs);
      } catch (e: any) {
        console.error('[SpecialtyFormsAdmin] Error cargando SOLO especialidades (specialties)', e);
        toast.error('Error cargando especialidades (revisar permisos de specialties)');
      }

      if (!isMounted) return;

      setForms(all);
      setSpecialties(specs);
      if (all.length > 0) {
        setSelectedId(all[0].id);
      }

      setLoading(false);
    };
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const selectedForm = forms.find(f => f.id === selectedId) || null;

  const updateSelectedForm = (updater: (prev: EditableForm) => EditableForm) => {
    if (!selectedForm) return;
    setForms(prev =>
      prev.map(f => (f.id === selectedForm.id ? updater(f) : f))
    );
  };

  const handleCreateForm = () => {
    const baseId = `form_${Date.now()}`;
    const newForm: EditableForm = {
      id: baseId,
      name: 'Nueva ficha clínica',
      specialties: ['default'],
      sections: [
        {
          id: 'section_1',
          title: 'Sección 1',
          fields: [],
        },
      ],
    };
    setForms(prev => [...prev, newForm]);
    setSelectedId(newForm.id);
  };

  const handleAddSection = () => {
    if (!selectedForm) return;
    const index = selectedForm.sections.length + 1;
    updateSelectedForm(prev => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          id: `section_${index}_${Date.now()}`,
          title: `Sección ${index}`,
          fields: [],
        },
      ],
    }));
  };

  const handleRemoveSection = (sectionId: string) => {
    if (!selectedForm) return;
    updateSelectedForm(prev => ({
      ...prev,
      sections: prev.sections.filter(s => s.id !== sectionId),
    }));
  };

  const handleAddField = (sectionId: string) => {
    if (!selectedForm) return;
    updateSelectedForm(prev => ({
      ...prev,
      sections: prev.sections.map(section => {
        if (section.id !== sectionId) return section;
        const index = section.fields.length + 1;
        const newField: FormField = {
          id: `field_${index}_${Date.now()}`,
          label: `Campo ${index}`,
          type: 'text',
          width: 'full',
        };
        return {
          ...section,
          fields: [...section.fields, newField],
        };
      }),
    }));
  };

  const handleRemoveField = (sectionId: string, fieldId: string) => {
    if (!selectedForm) return;
    updateSelectedForm(prev => ({
      ...prev,
      sections: prev.sections.map(section => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          fields: section.fields.filter(f => f.id !== fieldId),
        };
      }),
    }));
  };

  const handleFieldChange = (
    sectionId: string,
    fieldId: string,
    key: keyof FormField,
    value: any
  ) => {
    if (!selectedForm) return;
    updateSelectedForm(prev => ({
      ...prev,
      sections: prev.sections.map(section => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          fields: section.fields.map(field => {
            if (field.id !== fieldId) return field;
            return { ...field, [key]: value };
          }),
        };
      }),
    }));
  };

  const handleSectionTitleChange = (sectionId: string, title: string) => {
    if (!selectedForm) return;
    updateSelectedForm(prev => ({
      ...prev,
      sections: prev.sections.map(section =>
        section.id === sectionId ? { ...section, title } : section
      ),
    }));
  };

  const handleFormMetaChange = (key: keyof EditableForm, value: any) => {
    if (!selectedForm) return;
    setForms(prev =>
      prev.map(f => (f.id === selectedForm.id ? { ...f, [key]: value } : f))
    );
  };

  const parseOptionsInput = (raw: string) => {
    return raw
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  };

  const getOptionsInputValue = (field: FormField) => {
    const raw = optionsInputByField[field.id];
    if (raw !== undefined) return raw;
    return (field.options || []).join(', ');
  };

  const applyOptionsFromInput = (sectionId: string, fieldId: string, raw: string) => {
    setOptionsInputByField(prev => ({ ...prev, [fieldId]: raw }));
    const options = parseOptionsInput(raw);
    handleFieldChange(sectionId, fieldId, 'options', options);
  };

  const normalizeOption = (value: string) => {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  };

  const isYesNoField = (field: FormField) => {
    if (field.type !== 'radio') return false;
    if (!field.options || field.options.length === 0) return true;
    const normalized = field.options.map(opt => normalizeOption(opt));
    return normalized.includes('si') && normalized.includes('no');
  };

  const handleSave = async () => {
    if (!selectedForm) return;
    try {
      setSaving(true);
      const normalized: EditableForm = {
        ...selectedForm,
        sections: selectedForm.sections.map(section => ({
          ...section,
          fields: section.fields.map(field => {
            const raw = optionsInputByField[field.id];
            if (raw === undefined) return field;
            return { ...field, options: parseOptionsInput(raw) };
          }),
        })),
      };
      await specialtyFormsService.save(normalized);
      setForms(prev => prev.map(f => (f.id === selectedForm.id ? normalized : f)));
      toast.success('Ficha guardada correctamente');
    } catch (e: any) {
      console.error('[SpecialtyFormsAdmin] Error al guardar la ficha', e);
      toast.error('Error al guardar la ficha');
    } finally {
      setSaving(false);
    }};

  const handleDeleteForm = async () => {
    if (!selectedForm) return;
    try {
      setDeleting(true);
      await specialtyFormsService.delete(selectedForm.id);
      setForms(prev => prev.filter(f => f.id !== selectedForm.id));
      setSelectedId(prev => {
        const remaining = forms.filter(f => f.id !== selectedForm.id);
        return remaining[0]?.id || '';
      });
      toast.success('Ficha eliminada');
    } catch (e: any) {
      toast.error('Error al eliminar la ficha');
    } finally {
      setDeleting(false);
    }};

  const fieldTypeOptions: { value: FieldType; label: string }[] = [
    { value: 'text', label: 'Texto corto' },
    { value: 'textarea', label: 'Texto largo / párrafo' },
    { value: 'number', label: 'Número' },
    { value: 'date', label: 'Fecha' },
    { value: 'select', label: 'Lista desplegable' },
    { value: 'radio', label: 'Opción única (Sí/No, etc.)' },
    { value: 'checkbox', label: 'Casillas múltiples' },
    { value: 'multiText', label: 'Campos múltiples (texto)' },
  ];

  return (
    <div className="flex h-full">
      <div className="w-64 border-r border-slate-200 bg-slate-50/40 flex flex-col">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-white p-2 rounded-lg border border-slate-200">
              <FileSpreadsheet className="w-4 h-4 text-brand-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                Fichas Clínicas
              </p>
              <p className="text-[11px] text-slate-400">
                Definición de formularios por especialidad
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCreateForm}
            className="p-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 shadow-sm"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-xs text-slate-400">Cargando fichas...</div>
          ) : forms.length === 0 ? (
            <div className="p-4 text-xs text-slate-400">
              No hay fichas definidas. Cree una nueva para comenzar.
            </div>
          ) : (
            <ul className="space-y-1 p-2">
              {forms.map(form => (
                <li key={form.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(form.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between ${
                      selectedId === form.id
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                        : 'text-slate-600 hover:bg-white/70'
                    }`}
                  >
                    <span className="line-clamp-2">{form.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {!selectedForm ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            Seleccione o cree una ficha para comenzar.
          </div>
        ) : (
          <>
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-white">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <input
                    className="text-lg font-bold text-slate-900 bg-transparent border-none focus:outline-none focus:ring-0"
                    value={selectedForm.name}
                    onChange={e =>
                      handleFormMetaChange('name', e.target.value)
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
                    Especialidades
                  </span>
                  <div className="flex flex-col gap-2">
                    <select
                      className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 w-72"
                      value=""
                      onChange={e => {
                        const value = e.target.value;
                        if (!value) return;
                        if (selectedForm.specialties.includes(value)) return;
                        const next = [...selectedForm.specialties, value];
                        console.log('[SpecialtyFormsAdmin] Añadiendo especialidad a ficha', {
                          formId: selectedForm.id,
                          value,
                          prev: selectedForm.specialties,
                          next,
                        });
                        handleFormMetaChange('specialties', next);
                      }}
                    >
                      <option value="">Seleccionar especialidad...</option>
                      {specialties
                        .filter(s => !selectedForm.specialties.includes(s.name))
                        .map(spec => (
                          <option key={spec.id || spec.name} value={spec.name}>
                            {spec.name}
                          </option>
                        ))}
                    </select>
                    <div className="flex flex-wrap gap-2">
                      {selectedForm.specialties.map(name => (
                        <button
                          key={name}
                          type="button"
                          onClick={() =>
                            handleFormMetaChange(
                              'specialties',
                              selectedForm.specialties.filter(s => s !== name)
                            )
                          }
                          className="px-3 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-100 text-[11px] font-semibold flex items-center gap-1"
                        >
                          <span>{name}</span>
                          <span className="text-[10px] opacity-70">×</span>
                        </button>
                      ))}
                      {selectedForm.specialties.length === 0 && (
                        <span className="text-[11px] text-slate-400">
                          Ninguna especialidad asignada.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDeleteForm}
                  disabled={deleting}
                  className="px-3 py-2 text-xs font-bold rounded-xl border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {deleting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                  Eliminar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-brand-600 text-white hover:bg-brand-700 shadow-md disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Guardar cambios
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50">
              {selectedForm.sections.map(section => (
                <div
                  key={section.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <input
                      className="text-sm font-bold text-slate-800 bg-transparent border-none focus:outline-none focus:ring-0"
                      value={section.title}
                      onChange={e =>
                        handleSectionTitleChange(section.id, e.target.value)
                      }
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddField(section.id)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-900 text-white flex items-center gap-1.5"
                      >
                        <Plus className="w-3 h-3" />
                        Campo
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveSection(section.id)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {section.fields.length === 0 ? (
                    <div className="text-[11px] text-slate-400 italic">
                      Sin campos en esta sección.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {section.fields.map(field => (
                        <div
                          key={field.id}
                          className="grid grid-cols-12 gap-2 items-start border border-slate-100 rounded-xl p-3"
                        >
                          <div className="col-span-6 space-y-1">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                              Etiqueta
                            </span>
                            <input
                              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 bg-white"
                              value={field.label}
                              onChange={e =>
                                handleFieldChange(
                                  section.id,
                                  field.id,
                                  'label',
                                  e.target.value
                                )
                              }
                            />
                          </div>
                          <div className="col-span-3 space-y-1">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                              Formato de respuesta
                            </span>
                            <select
                              className="w-full text-xs px-2 py-2 rounded-lg border border-slate-200 bg-white"
                              value={field.type}
                              onChange={e =>
                                handleFieldChange(
                                  section.id,
                                  field.id,
                                  'type',
                                  e.target.value as FieldType
                                )
                              }
                            >
                              {fieldTypeOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-2 space-y-1">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                              Requerido
                            </span>
                            <select
                              className="w-full text-xs px-2 py-2 rounded-lg border border-slate-200 bg-white"
                              value={field.required ? 'yes' : 'no'}
                              onChange={e =>
                                handleFieldChange(
                                  section.id,
                                  field.id,
                                  'required',
                                  e.target.value === 'yes'
                                )
                              }
                            >
                              <option value="no">No</option>
                              <option value="yes">Sí</option>
                            </select>
                          </div>
                          <div className="col-span-1 flex items-start justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveField(section.id, field.id)
                              }
                              className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          {(field.type === 'select' ||
                            field.type === 'radio' ||
                            field.type === 'checkbox' ||
                            field.type === 'multiText') && (
                            <div className="col-span-12 space-y-1 pt-2">
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                                {field.type === 'multiText' ? 'Campos (separados por coma)' : 'Opciones (separadas por coma)'}
                              </span>
                              <input
                                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 bg-white"
                                value={getOptionsInputValue(field)}
                                onChange={e =>
                                  applyOptionsFromInput(section.id, field.id, e.target.value)
                                }
                              />
                            </div>
                          )}
                          <div className="col-span-12 pt-2">
                            <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                                Mostrar cuando sea Sí en
                              </span>
                              <select
                                className="text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white"
                                value={field.conditional?.fieldId || ''}
                                onChange={e => {
                                  const nextFieldId = e.target.value;
                                  if (!nextFieldId) {
                                    handleFieldChange(section.id, field.id, 'conditional', undefined);
                                    return;
                                  }
                                  handleFieldChange(section.id, field.id, 'conditional', {
                                    fieldId: nextFieldId,
                                    value: 'Si',
                                  });
                                }}
                              >
                                <option value="">Sin condición</option>
                                {selectedForm.sections
                                  .flatMap(s => s.fields)
                                  .filter(f => f.id !== field.id && f.type !== 'header' && f.type !== 'subHeader')
                                  .filter(isYesNoField)
                                  .map(f => (
                                    <option key={f.id} value={f.id}>
                                      {f.label}
                                    </option>
                                  ))}
                              </select>
                              {field.conditional?.fieldId && (
                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg">
                                  Sí
                                </span>
                              )}
                              {field.conditional?.fieldId && (
                                <button
                                  type="button"
                                  onClick={() => handleFieldChange(section.id, field.id, 'conditional', undefined)}
                                  className="text-[10px] font-bold text-red-500 hover:text-red-700 bg-red-50 border border-red-100 px-2 py-1 rounded-lg"
                                >
                                  Quitar
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddSection}
                className="px-4 py-2 rounded-xl bg-white border border-dashed border-slate-300 text-xs font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-2"
              >
                <Plus className="w-3 h-3" />
                Añadir sección
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
