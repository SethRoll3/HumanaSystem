
export interface UserProfile {
  uid: string;
  email: string;
  role: 'doctor' | 'admin' | 'receptionist' | 'nurse';
  name: string; 
  specialty: string;
  isActive?: boolean; // New field for soft delete
  signatureUrl?: string; // URL of the uploaded signature image
  digitalCertData?: {
      fileUrl: string; // La URL del .p12 en Storage
      issuedBy: string; // Entidad emisora (ej. Avosi, Camara de Comercio)
      issuedTo: string; // Nombre en el certificado
      serialNumber: string; // Serial único
      expiryDate: string; // Fecha vencimiento
  }; 
}

export enum PatientOrigin {
  PROPIO = 'Propio',
  IGSS = 'IGSS',
  ESTADO = 'Estado',
}

export interface PatientFile {
  name: string;
  url: string;
  type: string;
  uploadedAt: number;
}

export interface Patient {
  id: string; // Firebase ID (Can be same as billingCode or auto-generated)
  billingCode: string; // "Código del sistema de facturación" (Unique)
  
  fullName: string;
  occupation?: string; // New Occupation Field
  
  // New Contact Fields
  phone?: string;
  email?: string;
  responsibleName?: string; // "No hay" if check is true
  responsiblePhone?: string;
  responsibleEmail?: string;

  // Address Fields
  address?: {
      country: string;
      department?: string;
      municipality?: string;
      zone?: string;
  };

  // Context Fields
  consultationType?: 'Nueva' | 'Reconsulta';
  previousTreatment?: 'IGSS' | 'Medico Privado' | 'Hospital Nacional' | 'No ha estado en tratamiento';

  // Legacy fields made optional for the new "Quick Create" flow
  age?: number;
  gender?: 'M' | 'F' | 'masculino' | 'femenino'; 
  origin?: PatientOrigin | string;
  protocol_code?: string;
  medical_history?: string;
  
  // NEW: Attached files for medical history
  historyFiles?: PatientFile[];

  createdAt?: any;
}

export interface Medicine {
  id: string;
  code?: string; // NUEVO: Código interno (ej. FAR0001)
  name: string;
  stock: number; 
  units_per_box: number; 
  price: number; // Precio Público
  cost?: number; // NUEVO: Costo interno
  presentation: string; // "Medida" en el Excel
  category?: string;
  isExternal?: boolean;
}

// NUEVO: Interfaz para el Catálogo de Laboratorios
export interface LaboratoryItem {
    id: string;
    code?: string; // LAB0001
    name: string; // Descripcion
    measure?: string; // Medida (U)
    cost?: number;
    price: number;
}

export interface PrescriptionItem {
  medId: string;
  name: string;
  quantity: number;
  dosage: string; // Now optional/flexible
  duration_days: number | string;
  isExternal: boolean;
  units_per_box?: number;
  presentation?: string;
}

// --- NEW PATHOLOGY STRUCTURE ---
export interface Pathology {
  id?: string;
  name: string;
  exams: string[]; // List of mandatory exams for this pathology
}

// Simplified Specialty (Just name now)
export interface Specialty {
  id?: string;
  name: string;
}

// --- UPDATED REFERRAL GROUP ---
export interface ReferralGroup {
    id: string; // Unique ID for keying
    pathology: string; // The selected pathology name
    exams: string[];
    note?: string; // Specific note for this pathology
}

// --- SPECIALTY REFERRAL ---
export interface SpecialtyReferral {
    id: string;
    specialty: string;
    note?: string;
}

export interface Consultation {
  id?: string; 
  status: 'waiting' | 'in_progress' | 'finished' | 'delivered'; // Workflow Status Updated
  paymentReceipt?: string; // Boleta de Pago
  paymentAmount?: number; // NUEVO: Valor de la boleta para contabilidad
  
  receptionistId?: string; // Who created the check-in
  doctorId?: string; // Who is attending
  patientId: string;
  patientName?: string;
  patientIsForeign?: boolean; // NEW: Indica si el paciente es foráneo (no del depto Guatemala)
  doctorName?: string;
  date: number; 
  
  // Clinical Data (Can be null initially)
  vitals?: {
    temp: number;
    weight: number;
    pressure: string;
  };
  diagnosis?: string;
  
  // Referral Section - Updated
  referralGroups?: ReferralGroup[]; 
  referralNote?: string; 
  
  // Step 4: Referrals to Specialists
  specialtyReferrals?: SpecialtyReferral[];
  
  mentalHealthObservation?: string;

  prescription?: PrescriptionItem[];
  prescriptionNotes?: string; // New field for general prescription observations
  exams?: string[]; 
  
  signature?: {
    type: 'biometric' | 'digital_token' | 'image' | 'manual' | 'digital_p12';
    url?: string;
    tokenHash?: string;
    signerName?: string;
    signatureDate?: number;
    certificateSerial?: string;
  };
  
  followUpRequired?: boolean;
  followUpText?: string;

  // Track printing status for each doc
  printedDocs?: {
    prescription?: boolean;
    labs?: boolean;
    report?: boolean;
  };

  deliveredAt?: number;
  deliveredBy?: string;
  nonPrintReason?: string; // Reason for not printing docs when delivering

  // NEW: Track confirmed empty fields
  omittedFields?: { [key: string]: boolean };
}

export interface AppNotification {
  id?: string;
  title: string;
  message: string;
  timestamp: any; // Firestore Timestamp
  read: boolean;
  targetRole?: 'nurse' | 'admin' | 'all' | 'doctor'; // Made optional to support specific user targeting
  targetUserId?: string; // NEW: Target specific user (e.g. specific doctor)
  type: 'info' | 'success' | 'alert';
}

// --- MODULE 2: APPOINTMENTS SYSTEM ---

export type AppointmentStatus = 
  | 'scheduled'        // Cita agendada (Gris)
  | 'confirmed_phone'  // Confirmada por teléfono (Amarillo)
  | 'paid_checked_in'  // Pagada en caja / En sala (Verde) - UNICO ESTADO QUE PERMITE CONSULTA
  | 'in_progress'      // En consulta (Azul)
  | 'completed'        // Finalizada
  | 'cancelled'        // Cancelada
  | 'no_show';         // No se presentó

export interface Appointment {
  id?: string;
  patientId: string;
  patientName: string; // Desnormalizado para búsquedas rápidas
  doctorId: string;
  doctorName: string; // Desnormalizado
  
  // Timeframe
  date: any; // Timestamp (Fecha y hora de inicio)
  endDate: any; // Timestamp (Fecha y hora de fin estimada)
  
  status: AppointmentStatus;
  reason?: string; // Motivo de la cita
  
  // CRM Tracking
  createdAt: any;
  createdBy: string; // User ID
  
  confirmedAt?: any;
  confirmedBy?: string; // Recepcionista que llamó
  confirmationMethod?: 'En Persona' | 'Por Teléfono' | 'Por WhatsApp'; // NUEVO CAMPO
  
  paymentReceipt?: string; // Número de boleta (Requisito para pasar a consulta)
  paymentAmount?: number;
  paidAt?: any;
  paidBy?: string; // Cajero/Recepcionista que cobró
}
