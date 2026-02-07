export type FieldType = 'text' | 'number' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date' | 'header' | 'subHeader';

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  options?: string[]; 
  placeholder?: string;
  required?: boolean;
  width?: 'full' | 'half' | 'third'; 
  conditional?: { 
    fieldId: string;
    value: string;
  };
}

export interface FormSection {
  id: string;
  title: string;
  fields: FormField[];
}

export interface SpecialtyFormDefinition {
  id: string;
  name: string;
  specialties: string[]; 
  sections: FormSection[];
}
